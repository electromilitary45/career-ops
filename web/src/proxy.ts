import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  checkRequest,
  parseAllowedHosts,
  parseAllowedOrigins,
} from "@/lib/origin-guard.mjs";

// Public paths accessible without auth
const PUBLIC_PATHS = ["/jobs"];
const PUBLIC_API_PATHS = ["/api/jobs/daily", "/api/jobs/viewed"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  if (PUBLIC_API_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  return false;
}

function isAsset(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg")
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow assets
  if (isAsset(pathname)) return NextResponse.next();

  // Allow public routes
  if (isPublic(pathname)) return NextResponse.next();

  // For API routes: apply CSRF protection
  if (pathname.startsWith("/api/")) {
    const decision = checkRequest({
      secFetchSite: req.headers.get("sec-fetch-site"),
      origin: req.headers.get("origin"),
      host: req.headers.get("host"),
      allowedHosts: parseAllowedHosts(process.env.CAREER_OPS_WEB_ALLOWED_HOSTS),
      allowedOrigins: parseAllowedOrigins(process.env.CAREER_OPS_ALLOWED_ORIGINS),
    });
    if (!decision.ok) {
      return NextResponse.json({ error: decision.reason }, { status: decision.status });
    }
    // Non-public API routes blocked
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Block all other page routes
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export const config = { matcher: "/:path*" };
