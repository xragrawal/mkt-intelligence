/**
 * Facebook Content Types
 *
 * Type definitions for Facebook post data structure and scraping results.
 * Mirrors the LinkedIn content types with Facebook-specific field naming.
 */

export interface FacebookContentPost {
  authorName: string;
  authorProfileUrl: string;
  postContent: string;
  postUrl: string;
  publishedAt: string | null;   // raw text as scraped ("2h", "March 5 at 2:30 PM", etc.)
  reactionsCount: number;
  commentsCount: number;
  scrapedAt: string;            // ISO timestamp
}

export interface FacebookContentSearchResult {
  keyword: string;
  searchUrl: string;
  scrapedAt: string;
  posts: FacebookContentPost[];
  allProfileUrls: string[];
  allPostUrls: string[];
}

export interface FacebookScraperOptions {
  maxScrolls?: number;          // default: 5
  scrollDelay?: number;         // default: 2500 (Facebook renders slower than LinkedIn)
  expandPosts?: boolean;        // default: true
  timeout?: number;             // default: 30000
}
