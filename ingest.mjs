#!/usr/bin/env node

/**
 * ingest.mjs — Scrape STEMJobsCR boards → Firestore
 *
 * Reads the Google Sheet CSV (list of 201+ active job boards),
 * uses career-ops providers to scrape each board, and saves
 * results to Firestore with a daily key.
 *
 * Usage:
 *   node ingest.mjs                    # scrape all active boards
 *   node ingest.mjs --company Google   # scrape one company
 *   node ingest.mjs --dry-run          # preview without writing to Firestore
 *   node ingest.mjs --since 7          # only postings from last 7 days
 *
 * Requires:
 *   - .env file with Firebase service account credentials
 *   - .env file with GOOGLE_SHEET_CSV_URL
 *
 * Runs on OCI Always Free VM via cron every 20 minutes.
 */

import { existsSync, readFileSync, mkdirSync } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import * as yaml from 'js-yaml';

// ── Config ──────────────────────────────────────────────────────────

const CODE_ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));

// Load .env from career-ops root
try {
  const { config } = await import('dotenv');
  config({ quiet: true, path: path.join(CODE_ROOT, '.env') });
} catch { /* dotenv is optional */ }

const GOOGLE_SHEET_CSV_URL = process.env.GOOGLE_SHEET_CSV_URL ||
  'https://docs.google.com/spreadsheets/d/1wl7edAy6TcVuFh13LQ4FtvCZgPUb3ETFcQp8jlfuanM/export?format=csv&gid=0';

const CONCURRENCY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Firebase Admin ──────────────────────────────────────────────────

let db;

async function initFirebase() {
  // 1. Try FIREBASE_SERVICE_ACCOUNT env var (JSON string — used by GitHub Actions)
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (saJson) {
    const serviceAccount = JSON.parse(saJson);
    const admin = await import('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    db = admin.firestore();
    console.log('Firebase Admin initialized (env var)');
    return;
  }

  // 2. Try service account file (for local dev / OCI)
  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(CODE_ROOT, 'firebase-service-account.json');
  if (existsSync(saPath)) {
    const serviceAccount = JSON.parse(readFileSync(saPath, 'utf8'));
    const admin = await import('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    db = admin.firestore();
    console.log('Firebase Admin initialized (service account file)');
    return;
  }

  // Fallback: use firebase client SDK with env vars (for local dev)
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!apiKey || !projectId) {
    console.error('ERROR: No Firebase credentials found.');
    console.error('Set FIREBASE_SERVICE_ACCOUNT_PATH or NEXT_PUBLIC_FIREBASE_API_KEY + NEXT_PUBLIC_FIREBASE_PROJECT_ID');
    process.exit(1);
  }

  // For client SDK, we use dynamic import
  const { initializeApp, getApps } = await import('firebase/app');
  const { getFirestore } = await import('firebase/firestore');

  const firebaseConfig = {
    apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  db = getFirestore(app);
  console.log('Firebase Client SDK initialized (env vars)');
}

// ── Google Sheet CSV ────────────────────────────────────────────────

async function fetchSheetBoards() {
  console.log('Fetching Google Sheet CSV...');
  const res = await fetch(GOOGLE_SHEET_CSV_URL);
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
  const csv = await res.text();

  const lines = csv.split('\n');
  const boards = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV: Empresa,Link,Estado
    const parts = line.split(',');
    const empresa = parts[0]?.trim();
    const link = parts[1]?.trim();
    const estado = parts[2]?.trim();

    if (!empresa || !link || estado !== 'Activa') continue;

    boards.push({ name: empresa, careers_url: link });
  }

  console.log(`Found ${boards.length} active boards`);
  return boards;
}

// ── Provider Scraper ────────────────────────────────────────────────

async function loadProviders() {
  const providersDir = path.join(CODE_ROOT, 'providers');
  const { loadProviders: load, resolveProvider: resolve } = await import(
    pathToFileURL(path.join(providersDir, '_registry.mjs')).href
  );
  const { makeHttpCtx } = await import(
    pathToFileURL(path.join(providersDir, '_http.mjs')).href
  );

  const providers = await load(providersDir);
  return { providers, resolve, makeHttpCtx };
}

async function scrapeBoard(board, providers, resolve, makeHttpCtx) {
  const resolved = resolve(board, providers);
  if (!resolved || resolved.error) {
    return { jobs: [], error: resolved?.error || 'no provider found' };
  }

  const ctx = {
    ...makeHttpCtx(),
    sinceMs: Date.now() - 30 * DAY_MS,
    includeUndated: true,
  };

  try {
    const jobs = await resolved.provider.fetch(board, ctx);
    return { jobs: Array.isArray(jobs) ? jobs : [], provider: resolved.provider.id };
  } catch (err) {
    return { jobs: [], error: err.message };
  }
}

// ── Firestore Writer ────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

function jobHash(job) {
  // Simple dedup hash: company + title (normalized)
  const key = `${(job.company || '').toLowerCase()}-${(job.title || '').toLowerCase()}`.replace(/[^a-z0-9]/g, '');
  return key.slice(0, 40);
}

async function saveJobsToFirestore(jobs, source) {
  const dateKey = todayKey();
  const batch = db.batch();
  let count = 0;

  for (const job of jobs) {
    const hash = jobHash(job);
    const docId = `${dateKey}-${hash}`;

    const docRef = db.collection('jobs').doc(docId);
    batch.set(docRef, {
      company: job.company || '',
      title: job.title || '',
      url: job.url || '',
      location: job.location || '',
      description: (job.description || '').slice(0, 2000),
      source,
      date: dateKey,
      scrapedAt: new Date(),
      viewed: false,
    }, { merge: true }); // merge: don't overwrite if already exists

    count++;
    if (count % 500 === 0) {
      await batch.commit();
      console.log(`  Committed ${count} jobs...`);
    }
  }

  if (count % 500 !== 0) {
    await batch.commit();
  }

  return count;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const companyFilter = args.includes('--company') ? args[args.indexOf('--company') + 1] : null;

  console.log('═══════════════════════════════════════════');
  console.log('  STEM Jobs → Firestore Ingest');
  console.log(`  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════\n');

  await initFirebase();

  const boards = await fetchSheetBoards();
  const filtered = companyFilter
    ? boards.filter(b => b.name.toLowerCase().includes(companyFilter.toLowerCase()))
    : boards;

  if (filtered.length === 0) {
    console.log('No boards to scrape.');
    return;
  }

  console.log(`\nScraping ${filtered.length} boards (concurrency: ${CONCURRENCY})...\n`);

  const { providers, resolve, makeHttpCtx } = await loadProviders();

  let totalJobs = 0;
  let totalErrors = 0;
  let scraped = 0;

  // Process in batches
  for (let i = 0; i < filtered.length; i += CONCURRENCY) {
    const batch = filtered.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(board => scrapeBoard(board, providers, resolve, makeHttpCtx))
    );

    for (let j = 0; j < batch.length; j++) {
      const board = batch[j];
      const result = results[j];
      scraped++;

      if (result.error) {
        totalErrors++;
        if (scraped % 20 === 0 || result.jobs.length > 0) {
          console.log(`  [${scraped}/${filtered.length}] ✗ ${board.name}: ${result.error}`);
        }
      } else if (result.jobs.length > 0) {
        totalJobs += result.jobs.length;
        console.log(`  [${scraped}/${filtered.length}] ✓ ${board.name}: ${result.jobs.length} jobs (${result.provider})`);

        if (!dryRun) {
          await saveJobsToFirestore(result.jobs, result.provider);
        }
      } else {
        // Silent for empty boards
      }
    }
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(`  Done!`);
  console.log(`  Boards scraped: ${scraped}`);
  console.log(`  Total jobs: ${totalJobs}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log(`  Date: ${todayKey()}`);
  if (dryRun) console.log('  (dry run — nothing written to Firestore)');
  console.log('═══════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
