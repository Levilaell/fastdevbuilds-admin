/**
 * Append the ?v={place_id} marker to a preview URL so the embedded
 * public/track.js beacon fires when the lead opens it. Levi opening the
 * unmarked preview_url stored in the DB does not log a view — that's the
 * whole point of the param-gated tracker.
 */
export function withViewMarker(previewUrl: string, placeId: string): string {
  try {
    const u = new URL(previewUrl);
    u.searchParams.set("v", placeId);
    return u.toString();
  } catch {
    // If the URL is malformed we shouldn't be sending anyway, but stay safe:
    // returning the raw URL keeps existing send paths from blowing up. The
    // upstream URL validators in dispatch/compose will catch malformed URLs
    // before this is reached.
    return previewUrl;
  }
}
