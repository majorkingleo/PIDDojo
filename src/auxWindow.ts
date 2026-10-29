// ---------------------------------------------------------------------------
// Shared plumbing for the auxiliary windows (help page, tuning calculator).
// ---------------------------------------------------------------------------

/** Feature string for a centred popup that still fits the current screen. */
export function popupFeatures(width: number, height: number): string {
  const availW = window.screen.availWidth || 1280;
  const availH = window.screen.availHeight || 900;
  const w = Math.min(width, Math.max(420, availW - 80));
  const h = Math.min(height, Math.max(400, availH - 80));
  const left = Math.max(0, Math.round((availW - w) / 2));
  const top = Math.max(0, Math.round((availH - h) / 2));
  return `popup=yes,width=${w},height=${h},left=${left},top=${top}`;
}
