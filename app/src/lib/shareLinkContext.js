import { createContext } from "react";

// A function returning the link a Share button hands out, built from the app's
// current state (App.jsx; lib/urlState.js shareLink). Without a provider,
// ShareButton falls back to the address bar.
export const ShareLinkContext = createContext(null);
