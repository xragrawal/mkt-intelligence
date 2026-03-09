/**
 * Facebook Cookie Management
 *
 * Handles loading and saving Facebook authentication cookies.
 * Critical cookies: c_user (user ID), xs (session token), datr, sb
 */

import fs from "fs";
import path from "path";

/**
 * Resolve path to Facebook cookies file.
 * Priority: env var → project root (facebook-cookies.json)
 */
export function getCookiesPath(): string {
  const envPath = process.env.FACEBOOK_COOKIES_PATH;
  if (envPath) {
    return path.resolve(envPath);
  }

  // Check project root
  const projectRoot = process.cwd();
  return path.join(projectRoot, "facebook-cookies.json");
}

/**
 * Load cookies from file and validate c_user is present.
 */
export function loadCookiesFromFile(): any[] {
  const filePath = getCookiesPath();

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Facebook cookies file not found at ${filePath}. Run "npm run facebook:login" first.`
    );
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      throw new Error("Cookies file must contain a JSON array");
    }

    // Validate c_user cookie is present (Facebook session marker)
    const hasCUser = parsed.some(
      (c: any) => c.name === "c_user" && c.value?.length > 0
    );
    if (!hasCUser) {
      throw new Error(
        "c_user cookie not found or empty. Run 'npm run facebook:login' again."
      );
    }

    return parsed;
  } catch (err: any) {
    if (err.message.includes("c_user")) throw err;
    throw new Error(`Failed to parse cookies file: ${err.message}`);
  }
}

/**
 * Save cookies to file.
 */
export function saveCookiesToFile(cookies: any[]): void {
  const filePath = getCookiesPath();
  fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2));
  console.log(`✓ Cookies saved to ${filePath}`);
}
