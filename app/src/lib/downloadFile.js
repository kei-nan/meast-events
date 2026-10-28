/**
 * Saves `blob` as a file: an object URL clicked from a temporary link, attached
 * to the page for the click. The URL is revoked only after the click has handed
 * it to the download (revoking at once can cancel it in some browsers). Kept
 * apart from lib/exportResults.js (a lazy chunk) so the header's Share button
 * can use it without loading that chunk.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
