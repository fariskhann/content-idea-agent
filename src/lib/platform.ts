import type { InspirationPlatform, PlatformGroup } from "./types";

/** Maps Inspiration's real 3-way platform down to the 2-way PlatformGroup used by Category/Library matching. */
export function toPlatformGroup(p: InspirationPlatform): PlatformGroup {
  return p === "YouTube" ? "YouTube" : "IGTikTok";
}
