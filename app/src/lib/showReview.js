// Scrolls to and focuses the framing-review box (used by the notice above the text
// and by highlighted phrases).
export function showReview() {
  const box = document.getElementById("framing-review");
  if (!box) return;
  const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  box.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  box.focus({ preventScroll: true });
}
