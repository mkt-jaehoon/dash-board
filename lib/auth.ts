import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "./config";

export function getDashboardPassword() {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    throw new Error("DASHBOARD_PASSWORD is not configured.");
  }
  return password;
}

export function isAuthenticatedRequest(request: NextRequest) {
  return request.cookies.get(AUTH_COOKIE)?.value === "ok";
}

export function unauthorizedJson() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function applyAuthCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE, "ok", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
