import { createRoot } from "react-dom/client";
import React from "react";
import * as ReactDOM from "react-dom/client";

// Capture native fetch before third-party scripts (like FullStory) may wrap/override it.
if (typeof window !== "undefined" && !(window as any).__originalFetch) {
  try {
    (window as any).__originalFetch = window.fetch.bind(window);
    // Force window.fetch to call the captured original to avoid later wrappers causing 'Failed to fetch'
    try {
      (window as any).fetch = (...args: any[]) => {
        try {
          return (window as any).__originalFetch(...args);
        } catch (e) {
          // If original fetch throws synchronously, return a rejected promise
          return Promise.reject(e);
        }
      };
    } catch (e) {
      // ignore
    }
  } catch (e) {
    // ignore
  }
}

import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(<App />);

// Global handler for unhandled promise rejections to avoid noisy console errors
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (ev) => {
    try {
      console.warn("Unhandled promise rejection:", ev.reason);
      // prevent default to avoid browser-level logging duplication
      // ev.preventDefault(); // avoid calling preventDefault to keep normal behavior
    } catch (e) {
      // ignore
    }
  });
}

// Remove initial loader added in index.html after first paint
requestAnimationFrame(() => {
  try {
    const el = document.getElementById("initial-loader");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  } catch (e) {
    /* ignore */
  }
});
