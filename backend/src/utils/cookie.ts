import type { CookieOptions } from "express";

const isProduction = process.env.NODE_ENV === "production";
// Pulls domain from .env to allow cookies across subdomains (e.g., api.site.com & www.site.com)
const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

/**
 * Base configuration for secure backend cookies (e.g., Refresh Tokens, Sessions).
 */
export const getCookieOptions = (overrides: CookieOptions = {}): CookieOptions => ({
  httpOnly: true, // Prevents client-side JS from reading the cookie (XSS protection)
  secure: isProduction, // Requires HTTPS in production
  sameSite: isProduction ? "none" : "lax", // 'none' allows cross-origin requests
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
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
});