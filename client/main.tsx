import { createRoot } from "react-dom/client";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

// Remove initial loader added in index.html after first paint
requestAnimationFrame(() => {
  try {
    const el = document.getElementById('initial-loader');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  } catch (e) { /* ignore */ }
});
