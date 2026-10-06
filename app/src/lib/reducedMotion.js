// True while the user asks for reduced motion: map moves then jump instead of
// animating. Read on each call, so a changed OS setting applies at once.
export const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
