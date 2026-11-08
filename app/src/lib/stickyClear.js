// Keeping keyboard focus clear of a bar that sticks to the top of the panel's
// scroller (WCAG 2.4.11 Focus Not Obscured): the event view's action row, the
// Timeline view's year axis. The scroller keeps the bar's height clear
// (scroll-padding-top), so a row or link that focus moves to is scrolled to
// just below the bar, not under it.
//
// Both bars can be in the page at once (the list stays mounted, hidden, while
// an event is open), so each claims its clearance on the scroller and the
// scroller keeps the largest: a hidden bar has no height and claims nothing,
// and one going away does not clear what the other still needs.

/** Air between the bar and what focus scrolls to, in px. */
export const CLEAR_AIR_PX = 8;

/**
 * Where a stuck bar's bottom is, in px below the scroller's top edge: sticky
 * `top` counts from the scroller's content edge, inside its top padding (on
 * desktop it is minus that padding, SidePanel.css, so the bar sits at the very
 * top), and the bar's own height below that.
 */
export function stuckBottom({ padTop, stickTop, height }) {
  return padTop + stickTop + height;
}

/** The scroll-padding-top, in whole px, that keeps focus below a stuck bar; 0 for a bar with no height (hidden). */
export function clearancePx(geom) {
  if (!(geom.height > 0)) return 0;
  return Math.max(0, Math.ceil(stuckBottom(geom) + CLEAR_AIR_PX));
}

/** A sticky `bar`'s geometry in `scroller` (for stuckBottom and clearancePx), as laid out now. */
export function measureStuck(bar, scroller) {
  return {
    padTop: parseFloat(getComputedStyle(scroller).paddingTop) || 0,
    stickTop: parseFloat(getComputedStyle(bar).top) || 0,
    height: bar.getBoundingClientRect().height,
  };
}

const claims = new WeakMap();

/**
 * `key` (any object, one per bar) claims `px` of clearance on `scroller`, or
 * with `px` null gives its claim up; the scroller's scroll-padding-top becomes
 * the largest claim, and is removed when no bar claims any.
 */
export function claimClearance(scroller, key, px) {
  let byKey = claims.get(scroller);
  if (!byKey) claims.set(scroller, (byKey = new Map()));
  if (px == null) byKey.delete(key);
  else byKey.set(key, px);
  const most = Math.max(0, ...byKey.values());
  scroller.style.scrollPaddingTop = most > 0 ? `${most}px` : "";
}
