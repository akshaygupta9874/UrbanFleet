import type { CookieOptions } from "express";

const isProduction = process.env.NODE_ENV === "production";
// Pulls domain from .env to allow cookies across subdomains (e.g., api.site.com & www.site.com)
const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

// When FRONTEND_URL is http://localhost (like in Docker or local dev), secure must not be enforced
const isLocalhost =
  !process.env.FRONTEND_URL ||
  process.env.FRONTEND_URL.includes("localhost") ||
  process.env.FRONTEND_URL.includes("127.0.0.1");

const isSecure =
  process.env.COOKIE_SECURE === "true" ||
  (isProduction && !isLocalhost);

/**
 * Base configuration for secure backend cookies (e.g., Refresh Tokens, Sessions).
 */
export const getCookieOptions = (overrides: CookieOptions = {}): CookieOptions => ({
  httpOnly: true, // Prevents client-side JS from reading the cookie (XSS protection)
  secure: isSecure, // Requires HTTPS in production (disabled for localhost HTTP)
  sameSite: isSecure ? "none" : "lax", // 'none' requires secure=true; 'lax' allows cross-port localhost
  path: "/",
  ...(cookieDomain && { domain: cookieDomain }),
  ...overrides,
});

/**
 * Configuration specifically for CSRF cookies.
 * httpOnly MUST be false so the frontend JS can read it and attach it to headers.
 */
export const getCsrfCookieOptions = (overrides: CookieOptions = {}): CookieOptions => ({
  ...getCookieOptions({
    httpOnly: false,
    ...overrides,
  }),
});

/**
 * Helper to reliably clear cookies during logout.
 * Express requires the 'path' and 'domain' to match exactly when clearing a cookie.
 */
export const clearCookieOptions = (): CookieOptions => ({
  path: "/",
  ...(cookieDomain && { domain: cookieDomain }),
  secure: isSecure,
  sameSite: isSecure ? "none" : "lax",
});