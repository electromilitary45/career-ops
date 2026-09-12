import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public routes that anyone can access
const PUBLIC_PATHS = [
  "/jobs",
  "/api/jobs/daily",
  "/api/jobs/viewed",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // Allow static assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".js")
  ) {
    return NextResponse.next();
  }

  // Block everything else
  return NextResponse.json(
    { error: "Not found" },
    { status: 404 }
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
