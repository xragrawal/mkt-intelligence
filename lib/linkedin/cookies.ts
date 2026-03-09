/**
 * LinkedIn Cookie Utilities
 *
 * Cookies are stored as a local JSON file in the project root.
 * They must NEVER be stored in env vars, secret managers, databases, or cloud storage.
 */

import fs from "fs";
import path from "path";

const COOKIE_FILE_NAMES = ["linkedin-cookies.json", "linkedin_cookie.json"];

/**
 * Resolve the path to the LinkedIn cookies file.
 * Priority:
 *   1. LINKEDIN_COOKIES_PATH env var
 *   2. linkedin-cookies.json in project root
 *   3. linkedin_cookie.json in project root
 */
export function getCookiesPath(): string {
  // Check env var first
  const envPath = process.env.LINKEDIN_COOKIES_PATH;
  if (envPath) {
    const resolved = path.resolve(envPath);
    if (fs.existsSync(resolved)) return resolved;
    // If env var is set but file doesn't exist, still return it (for saveCookies)
    return resolved;
  }

  // Fallback: search project root for known cookie file names
  const projectRoot = path.resolve(process.cwd());
  for (const name of COOKIE_FILE_NAMES) {
    const candidate = path.join(projectRoot, name);
    if (fs.existsSync(candidate)) return candidate;
  }

  // Default to the first name if nothing found (for initial save)
  return path.join(projectRoot, COOKIE_FILE_NAMES[0]);
}

/**
 * Load LinkedIn cookies from the local JSON file.
 * Returns an array of Puppeteer-compatible cookie objects.
 * Throws if the file doesn't exist or is malformed.
 */
export function loadCookiesFromFile(): Array<{
  name: string;
  value: string;
  domain: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}> {
  const cookiePath = getCookiesPath();

  if (!fs.existsSync(cookiePath)) {
    throw new Error(
      `LinkedIn cookies file not found at: ${cookiePath}\n` +
        `Run "npm run linkedin:login" to generate cookies, or set LINKEDIN_COOKIES_PATH.`
    );
  }

  const raw = fs.readFileSync(cookiePath, "utf-8");
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse LinkedIn cookies file: ${cookiePath}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `LinkedIn cookies file must contain a JSON array. Got: ${typeof parsed}`
    );
  }

  // Validate that the critical li_at cookie is present
  const hasLiAt = parsed.some(
    (c: any) => c.name === "li_at" && c.value && c.value.length > 0
  );
  if (!hasLiAt) {
    throw new Error(
      `LinkedIn cookies file is missing the critical "li_at" cookie.\n` +
        `Re-run "npm run linkedin:login" to refresh cookies.`
    );
  }

  return parsed;
}

/**
 * Save cookies to the local JSON file.
 */
export function saveCookiesToFile(
  cookies: Array<Record<string, unknown>>
): void {
  const cookiePath = getCookiesPath();
  fs.writeFileSync(cookiePath, JSON.stringify(cookies, null, 2), "utf-8");
  console.log(`Cookies saved to: ${cookiePath}`);
}
