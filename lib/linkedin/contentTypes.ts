/**
 * LinkedIn Content Scraping — Type Definitions
 */

export interface LinkedInContentPost {
  /** Display name of the post author */
  authorName: string;
  /** Full LinkedIn profile URL of the author */
  authorProfileUrl: string;
  /** Raw text content of the post */
  postContent: string;
  /** Direct URL to the LinkedIn post */
  postUrl: string;
  /** ISO timestamp when the post was published (best-effort from relative date) */
  publishedAt: string | null;
  /** Number of reactions (likes, celebrates, etc.) */
  reactionsCount: number;
  /** Number of comments */
  commentsCount: number;
  /** ISO timestamp when this post was scraped */
  scrapedAt: string;
}

export interface LinkedInContentSearchResult {
  /** The keyword used for the search */
  keyword: string;
  /** Full LinkedIn search URL that was scraped */
  searchUrl: string;
  /** ISO timestamp when the scrape completed */
  scrapedAt: string;
  /** Array of extracted posts */
  posts: LinkedInContentPost[];
  /** All unique profile URLs found on the page */
  allProfileUrls: string[];
  /** All unique post URLs found on the page */
  allPostUrls: string[];
}

export interface LinkedInScraperOptions {
  /** Maximum number of scroll iterations (default: 5) */
  maxScrolls?: number;
  /** Delay between scrolls in ms (default: 2000) */
  scrollDelay?: number;
  /** Whether to expand "See more" on posts (default: true) */
  expandPosts?: boolean;
  /** Browser launch timeout in ms (default: 30000) */
  timeout?: number;
}
