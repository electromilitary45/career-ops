import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/jobs/daily?date=2026-09-12&viewed=false&source=greenhouse&limit=50&offset=0
 *
 * Returns jobs scraped on a given date from Firestore.
 * All params optional — defaults to today, all viewed states, all sources.
 * Pagination: limit (max 200, default 50) + offset.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || new Date().toISOString().split("T")[0];
  const viewed = url.searchParams.get("viewed"); // "true" | "false" | null (all)
  const source = url.searchParams.get("source"); // e.g. "greenhouse" | null (all)
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  try {
    const db = getAdminDb();
    const snapshot = await db.collection("jobs")
      .where("date", "==", date)
      .limit(2000)
      .get();

    let allJobs = snapshot.docs.map((doc) => {
      const data = doc.data();
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
        scrapedAt: data.scrapedAt?.toDate?.()?.toISOString() || null,
      };
    });

    // Filters
    if (viewed === "true") allJobs = allJobs.filter((j) => j.viewed);
    else if (viewed === "false") allJobs = allJobs.filter((j) => !j.viewed);
    if (source) allJobs = allJobs.filter((j) => j.source === source);

    const total = allJobs.length;
    const jobs = allJobs.slice(offset, offset + limit);

    return NextResponse.json({
      ok: true,
      date,
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
      jobs,
    });
  } catch (error) {
    console.error("/api/jobs/daily error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("FIREBASE_SERVICE_ACCOUNT")) {
      return NextResponse.json(
        { error: "Server config missing: FIREBASE_SERVICE_ACCOUNT" },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
