import { useCallback, useState } from "react";
import { STORAGE_KEY, parseStoredWidth } from "../lib/panelWidth.js";

// The side panel's width as the reader set it (components/PanelResizer.jsx),
// remembered in this browser. null = the default width from the CSS. Storage
// may throw or be blocked (private mode); the panel then starts at its default.

function readStoredWidth() {
  try {
    return parseStoredWidth(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeStoredWidth(width) {
  try {
    if (width === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // Not remembered; this visit still uses it.
  }
}

/**
 * {width, setWidth, commit, reset}: setWidth while dragging (not stored),
 * commit(width) when a drag ends or a key is pressed, reset() back to the default.
 */
export default function usePanelWidth() {
  const [width, setWidth] = useState(readStoredWidth);
  const commit = useCallback((w) => {
    setWidth(w);
    writeStoredWidth(w);
  }, []);
  const reset = useCallback(() => {
    setWidth(null);
    writeStoredWidth(null);
  }, []);
  return { width, setWidth, commit, reset };
}
