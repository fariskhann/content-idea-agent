/** Pulls a bare username out of a pasted TikTok/Instagram profile link, @handle, or plain username. */
export function parseProfileHandle(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/(?:tiktok\.com|instagram\.com)\/@?([\w.-]+)/i);
  if (urlMatch) return urlMatch[1];
  return trimmed.replace(/^@/, "").replace(/\/+$/, "");
}
