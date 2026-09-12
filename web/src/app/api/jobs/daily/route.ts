import { NextResponse } from "next/server";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/jobs/daily?date=2026-09-12&viewed=false&source=greenhouse&limit=50
 *
 * Returns jobs scraped on a given date from Firestore.
 * All params optional — defaults to today, all viewed states, all sources.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || new Date().toISOString().split("T")[0];
  const viewed = url.searchParams.get("viewed"); // "true" | "false" | null (all)
  const source = url.searchParams.get("source"); // e.g. "greenhouse" | null (all)
  const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);

  try {
    let q = query(
      collection(db, "jobs"),
      where("date", "==", date),
      orderBy("scrapedAt", "desc")
    );

    // Firestore doesn't support != queries well, so we filter viewed client-side
    // or use whereEqualTo for specific values
    if (viewed === "true") {
      q = query(
        collection(db, "jobs"),
        where("date", "==", date),
        where("viewed", "==", true),
        orderBy("scrapedAt", "desc")
      );
    } else if (viewed === "false") {
      q = query(
        collection(db, "jobs"),
        where("date", "==", date),
        where("viewed", "==", false),
        orderBy("scrapedAt", "desc")
      );
    }

    const snapshot = await getDocs(q);
    const allJobs = snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return {
        id: doc.id,
        company: data.company || "",
        title: data.title || "",
        url: data.url || "",
        location: data.location || "",
        description: data.description || "",
        source: data.source || "",
        date: data.date || "",
        viewed: data.viewed ?? false,
        scrapedAt: (data.scrapedAt as { toDate?: () => Date })?.toDate?.()?.toISOString() || null,
      };
    });

    // Client-side source filter (Firestore OR queries are limited)
    const jobs = source ? allJobs.filter((j) => j.source === source) : allJobs;

    return NextResponse.json({
      ok: true,
      date,
      count: jobs.length,
      jobs: jobs.slice(0, limit),
    });
  } catch (error) {
    console.error("/api/jobs/daily error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to query jobs" },
      { status: 500 }
    );
  }
}
