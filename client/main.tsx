import { createRoot } from "react-dom/client";
import React from "react";
import * as ReactDOM from "react-dom/client";

// Capture native fetch before third-party scripts (like FullStory) may wrap/override it.
if (typeof window !== "undefined" && !(window as any).__originalFetch) {
  try {
    (window as any).__originalFetch = window.fetch.bind(window);
  } catch (e) {
    // ignore
  }
}

import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);

// Remove initial loader added in index.html after first paint
requestAnimationFrame(() => {
  try {
    const el = document.getElementById("initial-loader");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  } catch (e) {
    /* ignore */
  }
});
