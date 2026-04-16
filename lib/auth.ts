import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "./config";

const AUTH_TOKEN_MESSAGE = "dashboard-auth-v1";

export function getDashboardPassword() {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    throw new Error("DASHBOARD_PASSWORD is not configured.");
  }
  return password;
}

function computeAuthToken(secret: string): string {
  return crypto.createHmac("sha256", secret).update(AUTH_TOKEN_MESSAGE).digest("hex");
}

export function isAuthenticatedRequest(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return false;
  const expected = computeAuthToken(getDashboardPassword());
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function verifyPassword(input: string, expected: string): boolean {
  if (input.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(input), Buffer.from(expected));
}

export function unauthorizedJson() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function applyAuthCookie(response: NextResponse) {
  const token = computeAuthToken(getDashboardPassword());
  response.cookies.set(AUTH_COOKIE, token, {
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
