import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

const EXPECTED_SECRET = process.env.VIEWED_SECRET;

/**
 * POST /api/jobs/viewed
 *
 * Mark jobs as viewed (or unviewed).
 * Requires x-viewed-secret header matching VIEWED_SECRET env var.
 * Body: { ids: ["2026-09-12-abc", "2026-09-12-def"], viewed?: boolean }
 * Default viewed = true.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-viewed-secret");
  if (!EXPECTED_SECRET || secret !== EXPECTED_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { ids?: string[]; viewed?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids array required" }, { status: 400 });
  }

  if (ids.length > 500) {
    return NextResponse.json({ error: "max 500 ids per request" }, { status: 400 });
  }

  const viewed = body.viewed !== false; // default true

  try {
    const db = getAdminDb();
    // Firestore batch limit is 500
    for (let i = 0; i < ids.length; i += 500) {
      const batch = db.batch();
      const chunk = ids.slice(i, i + 500);
      for (const id of chunk) {
        batch.update(db.collection("jobs").doc(id), { viewed });
      }
      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      updated: ids.length,
      viewed,
    });
  } catch (error) {
    console.error("/api/jobs/viewed error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed to update" },
      { status: 500 }
    );
  }
}
