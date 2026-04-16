import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/config";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/login")
  ) {
    return NextResponse.next();
  }

  const isAuthenticated = request.cookies.get(AUTH_COOKIE)?.value === "ok";
  if (isAuthenticated) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
