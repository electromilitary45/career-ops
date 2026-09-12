#!/usr/bin/env node

/**
 * ingest.mjs — Fetch STEM Jobs from Telegram channels → Firestore
 *
 * Fetches job posts from:
 *   - https://t.me/s/STEMJobsCR (Costa Rica)
 *   - https://t.me/s/STEMJobsLATAM (LATAM remote)
 *
 * Parses the HTML, extracts job data, and saves to Firestore.
 *
 * Usage:
 *   node ingest.mjs                    # fetch both channels
 *   node ingest.mjs --channel CR       # fetch only STEMJobsCR
 *   node ingest.mjs --channel LATAM    # fetch only STEMJobsLATAM
 *   node ingest.mjs --dry-run          # preview without writing
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';

const CODE_ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));

// Load .env
try {
  const { config } = await import('dotenv');
  config({ quiet: true, path: path.join(CODE_ROOT, '.env') });
} catch { /* dotenv is optional */ }

// ── Telegram Channels ──────────────────────────────────────────────

const CHANNELS = {
  CR: { url: 'https://t.me/s/STEMJobsCR', source: 'telegram-cr', label: '🇨🇷 Costa Rica' },
  LATAM: { url: 'https://t.me/s/STEMJobsLATAM', source: 'telegram-latam', label: '🌎 LATAM' },
};

// ── Firebase Admin ─────────────────────────────────────────────────

let db;

async function initFirebase() {
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (saJson) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(saJson);
    } catch (e) {
      console.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON:', e.message);
      process.exit(1);
    }
    if (!serviceAccount || !serviceAccount.project_id) {
      console.error('FIREBASE_SERVICE_ACCOUNT missing project_id');
      process.exit(1);
    }
    const adminModule = await import('firebase-admin');
    const admin = adminModule.default || adminModule;
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    db = admin.firestore();
    console.log('Firebase Admin initialized, project:', serviceAccount.project_id);
    return;
  }

  const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(CODE_ROOT, 'firebase-service-account.json');
  if (existsSync(saPath)) {
    const serviceAccount = JSON.parse(readFileSync(saPath, 'utf8'));
    const adminModule = await import('firebase-admin');
    const admin = adminModule.default || adminModule;
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    db = admin.firestore();
    console.log('Firebase Admin initialized (service account file)');
    return;
  }

  console.error('ERROR: No Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH');
  process.exit(1);
}

// ── Telegram Parser ────────────────────────────────────────────────

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(str) {
  return str.replace(/<[^>]*>/g, '');
}

function extractBetween(html, startTag, endTag) {
  const start = html.indexOf(startTag);
  if (start === -1) return '';
  const end = html.indexOf(endTag, start + startTag.length);
  if (end === -1) return html.slice(start + startTag.length);
  return html.slice(start + startTag.length, end);
}

function parseTelegramPost(html) {
  const job = { title: '', company: '', location: '', url: '', description: '' };

  // Extract text content from tgme_widget_message_text
  const textBlock = extractBetween(html, 'tgme_widget_message_text', '</div>');
  if (!textBlock) return null;

  // Replace <br/> with newlines before stripping tags
  const text = decodeHtmlEntities(stripTags(textBlock.replace(/<br\s*\/?>/gi, '\n')));

  // Title: first line after the pipe separator (emoji | Title)
  const titleMatch = text.match(/\|\s*(.+?)(?:\n|$)/);
  if (titleMatch) {
    job.title = titleMatch[1].trim();
  }

  // Company: between "Empresa:" and next newline or "Ubicación:" or "Tags:"
  const companyMatch = text.match(/Empresa:\s*(.+?)(?:\n|Ubicaci|Tags:|$)/i);
  if (companyMatch) {
    job.company = companyMatch[1].trim();
  }

  // Location: between "Ubicación:" and next newline or "Tags:" or "Empresa:"
  const locationMatch = text.match(/Ubicaci[oó]n:\s*(.+?)(?:\n|Tags:|Empresa:|$)/i);
  if (locationMatch) {
    job.location = locationMatch[1].trim();
  }

  // URL: first link in the text block
  const linkMatch = textBlock.match(/href="(https?:\/\/[^"]+)"/);
  if (linkMatch) {
    job.url = linkMatch[1];
  }

  // Description: from link preview if available
  const descMatch = html.match(/link_preview_description[^>]*>([^<]+)/);
  if (descMatch) {
    job.description = decodeHtmlEntities(descMatch[1]).trim().slice(0, 2000);
  }

  // Date from time element
  const timeMatch = html.match(/datetime="([^"]+)"/);
  if (timeMatch) {
    job.postedAt = timeMatch[1];
  }

  return job;
}

function parseTelegramChannel(html) {
  const posts = [];
  const msgRegex = /tgme_widget_message_wrap[^"]*"[^>]*>([\s\S]*?)(?=tgme_widget_message_wrap|$)/g;
  let match;

  while ((match = msgRegex.exec(html)) !== null) {
    const postHtml = match[1];
    const job = parseTelegramPost(postHtml);
    if (job && job.title && job.url) {
      posts.push(job);
    }
  }

  return posts;
}

// ── Fetch Channel ──────────────────────────────────────────────────

async function fetchChannel(channel) {
  console.log(`Fetching ${channel.label} (${channel.url})...`);

  try {
    const res = await fetch(channel.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobTrackerBot/1.0)' },
    });

    if (!res.ok) {
      console.error(`  HTTP ${res.status} from ${channel.url}`);
      return [];
    }

    const html = await res.text();
    const jobs = parseTelegramChannel(html);
    console.log(`  Found ${jobs.length} jobs from ${channel.label}`);
    return jobs;
  } catch (err) {
    console.error(`  Error fetching ${channel.label}:`, err.message);
    return [];
  }
}

// ── Firestore Writer ───────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

function jobHash(job) {
  const key = `${(job.company || '').toLowerCase()}-${(job.title || '').toLowerCase()}`.replace(/[^a-z0-9]/g, '');
  return key.slice(0, 40);
}

async function saveJobsToFirestore(jobs, source) {
  const dateKey = todayKey();
  let batch = db.batch();
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
      postedAt: job.postedAt || null,
      scrapedAt: new Date(),
      viewed: false,
    }, { merge: true });

    count++;
    if (count % 500 === 0) {
      await batch.commit();
      console.log(`  Committed ${count} jobs...`);
      batch = db.batch();
    }
  }

  if (count % 500 !== 0) {
    await batch.commit();
  }

  return count;
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const channelFilter = args.includes('--channel') ? args[args.indexOf('--channel') + 1]?.toUpperCase() : null;

  console.log('═══════════════════════════════════════════');
  console.log('  STEM Jobs → Telegram → Firestore');
  console.log(`  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════\n');

  await initFirebase();

  const channelsToFetch = channelFilter
    ? Object.entries(CHANNELS).filter(([k]) => k === channelFilter)
    : Object.entries(CHANNELS);

  let totalJobs = 0;

  for (const [key, channel] of channelsToFetch) {
    const jobs = await fetchChannel(channel);

    if (jobs.length > 0 && !dryRun) {
      const saved = await saveJobsToFirestore(jobs, channel.source);
      totalJobs += saved;
      console.log(`  Saved ${saved} jobs to Firestore (${channel.label})`);
    } else if (dryRun && jobs.length > 0) {
      console.log(`  [dry-run] Would save ${jobs.length} jobs (${channel.label})`);
      jobs.slice(0, 3).forEach(j => console.log(`    - ${j.company}: ${j.title}`));
      totalJobs += jobs.length;
    }
  }

  console.log('\n═══════════════════════════════════════════');
  console.log(`  Done! Total jobs: ${totalJobs}`);
  if (dryRun) console.log('  (dry run — nothing written to Firestore)');
  console.log('═══════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
