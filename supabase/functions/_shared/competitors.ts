/**
 * Competitor and OEM reference lists for FlytBase LeadGen.
 *
 * COMPETITORS — companies we must NEVER email (direct competitors).
 * Add new entries as plain strings; matching is case-insensitive substring.
 */
export const COMPETITOR_NAMES: string[] = [
  "DroneSense",
  "Versaterm",
  // ── add more competitors below ──
];

/**
 * Known drone hardware OEMs.
 * These are EXCLUDED from lead extraction and involvedParties listings
 * because they are hardware vendors, not FlytBase software buyers.
 */
export const DRONE_OEMS: string[] = [
  "DJI", "DJI Enterprise",
  "Skydio",
  "Autel Robotics", "Autel",
  "Parrot",
  "Wingtra",
  "senseFly",
  "Freefly Systems", "Freefly",
  "Zipline",
  "Wing", // Alphabet / Google
  "Amazon Prime Air",
  "Percepto",
  "Yuneec",
  "PowerVision",
  "Teledyne FLIR", "FLIR",
  "Hextronics", // Compatible partner — still OEM, not a lead
];

/**
 * OEMs whose DOCK hardware is compatible with FlytBase.
 * If an article mentions a company using any of these OEMs, the email
 * can reference dock-based autonomous operations as a value prop.
 * Any other OEM → use the software/fleet management pitch instead.
 */
export const FLYTBASE_COMPATIBLE_DOCK_OEMS: string[] = [
  "DJI",
  "Hextronics",
];

/** Returns true if the OEM is compatible with FlytBase dock integration */
export function isCompatibleDockOem(oem: string | null | undefined): boolean {
  if (!oem) return true; // unknown OEM — default to dock pitch (don't restrict)
  const low = oem.toLowerCase();
  return FLYTBASE_COMPATIBLE_DOCK_OEMS.some((c) => low.includes(c.toLowerCase()));
}

/** Returns true if the company name matches a known competitor */
export function isCompetitor(companyName: string | null | undefined): boolean {
  if (!companyName) return false;
  const low = companyName.toLowerCase();
  return COMPETITOR_NAMES.some((c) => low.includes(c.toLowerCase()));
}
