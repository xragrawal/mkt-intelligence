/**
 * Facebook HTML Analyzer
 *
 * Analyzes saved Facebook page HTML to identify DOM structure and selectors.
 * Usage: npx tsx scripts/analyze-facebook-html.ts <html-file>
 */

import fs from "fs";
import path from "path";

const htmlFile = process.argv[2];

if (!htmlFile) {
  console.error("Usage: npx tsx scripts/analyze-facebook-html.ts <html-file>");
  process.exit(1);
}

const filePath = path.resolve(htmlFile);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

console.log(`\n📄 Analyzing: ${htmlFile}\n`);

const html = fs.readFileSync(filePath, "utf-8");

// Helper to count occurrences
function countMatches(pattern: RegExp): number {
  const matches = html.match(pattern);
  return matches ? matches.length : 0;
}

// Analysis 1: Find article-like containers
console.log("=== ARTICLE CONTAINERS ===\n");

const articleSelectors = [
  { sel: 'div[role="article"]', regex: /role="article"/g },
  { sel: 'div[data-testid="story-subtitles"]', regex: /data-testid="story-subtitles"/g },
  { sel: 'div[data-pagelet^="FeedUnit"]', regex: /data-pagelet="FeedUnit[^"]*"/g },
  { sel: 'div[data-pagelet^="Feed"]', regex: /data-pagelet="Feed[^"]*"/g },
  { sel: 'div[class*="story"]', regex: /class="[^"]*story[^"]*"/g },
  { sel: 'div[class*="post"]', regex: /class="[^"]*post[^"]*"/g },
];

articleSelectors.forEach(({ sel, regex }) => {
  const count = countMatches(regex);
  if (count > 0) {
    console.log(`✅ ${sel}: ${count} found`);
  }
});

// Analysis 2: Find post content containers
console.log("\n=== POST CONTENT CONTAINERS ===\n");

const contentSelectors = [
  { sel: 'div[data-ad-comet-preview="message"]', regex: /data-ad-comet-preview="message"/g },
  { sel: 'div[data-testid="post_message"]', regex: /data-testid="post_message"/g },
  { sel: '[data-ad-rendering-role="story_message"]', regex: /data-ad-rendering-role="story_message"/g },
  { sel: 'span[dir="auto"]', regex: /span[^>]*dir="auto"/g },
  { sel: '[data-ad-comet-preview]', regex: /data-ad-comet-preview="/g },
];

contentSelectors.forEach(({ sel, regex }) => {
  const count = countMatches(regex);
  if (count > 0) {
    console.log(`✅ ${sel}: ${count} found`);
  }
});

// Analysis 3: Find timestamp elements
console.log("\n=== TIMESTAMP ELEMENTS ===\n");

const timeSelectors = [
  { sel: 'abbr[data-utime]', regex: /abbr[^>]*data-utime/g },
  { sel: 'abbr[title]', regex: /abbr[^>]*title/g },
  { sel: 'time', regex: /<time/g },
  { sel: '[aria-label*="ago"]', regex: /aria-label="[^"]*ago[^"]*"/g },
];

timeSelectors.forEach(({ sel, regex }) => {
  const count = countMatches(regex);
  if (count > 0) {
    console.log(`✅ ${sel}: ${count} found`);
  }
});

// Analysis 4: Find role attributes
console.log("\n=== ROLE ATTRIBUTES ===\n");

const roleMatches = html.match(/role="([^"]+)"/g) || [];
const roleTypes = new Map<string, number>();

roleMatches.forEach((match) => {
  const role = match.replace(/role="|"/g, "");
  roleTypes.set(role, (roleTypes.get(role) || 0) + 1);
});

Array.from(roleTypes.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([role, count]) => {
    console.log(`  role="${role}": ${count}`);
  });

// Analysis 5: Find data-testid values
console.log("\n=== DATA-TESTID VALUES ===\n");

const testIdMatches = html.match(/data-testid="([^"]+)"/g) || [];
const testIds = new Map<string, number>();

testIdMatches.forEach((match) => {
  const id = match.replace(/data-testid="|"/g, "");
  testIds.set(id, (testIds.get(id) || 0) + 1);
});

Array.from(testIds.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .forEach(([id, count]) => {
    console.log(`  data-testid="${id}": ${count}`);
  });

// Analysis 6: Find data-pagelet values
console.log("\n=== DATA-PAGELET VALUES ===\n");

const pageletMatches = html.match(/data-pagelet="([^"]+)"/g) || [];
const pagelets = new Map<string, number>();

pageletMatches.forEach((match) => {
  const pagelet = match.replace(/data-pagelet="|"/g, "");
  pagelets.set(pagelet, (pagelets.get(pagelet) || 0) + 1);
});

Array.from(pagelets.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([pagelet, count]) => {
    console.log(`  data-pagelet="${pagelet}": ${count}`);
  });

// Analysis 7: Sample HTML snippet
console.log("\n=== SAMPLE HTML (first 2000 chars) ===\n");
console.log(html.substring(0, 2000));
console.log("\n...\n");

console.log("✨ Analysis complete!\n");
console.log("Recommendations:");
console.log("1. Look at the role, data-testid, and data-pagelet values above");
console.log("2. Search the HTML snippet for 'role=\"article\"' or similar article containers");
console.log("3. Update the selectors in lib/facebook/contentClient.ts");
console.log("4. Re-run the collection\n");
