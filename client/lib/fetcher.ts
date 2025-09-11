export async function safeFetch(u: string, opts?: RequestInit) {
  const doFetch = async (url: string) => {
    try {
      const r = await fetch(url, opts);
      return r;
    } catch (err) {
      // rethrow so caller can handle and potentially try alternative forms
      throw err;
    }
  };

  const tryUrls: string[] = [];
  try {
    const urlObj = new URL(u);
    tryUrls.push(u);
    if (urlObj.pathname.startsWith("/api/")) {
      // add Netlify functions alternative
      const altPath = urlObj.pathname.replace(/^\/api\//, "/.netlify/functions/api/");
      const alt = new URL(altPath, urlObj.origin).toString();
      tryUrls.push(alt); // try original first, alt second
      // also try relative path (no origin) as some preview/proxy setups block absolute origin fetches
      tryUrls.push(urlObj.pathname + urlObj.search);
    }
  } catch (e) {
    // fallback to original url only
    tryUrls.push(u);
  }

  // retry sequence with small backoff
  let lastErr: any = null;
  for (let attempt = 0; attempt < tryUrls.length; attempt++) {
    const url = tryUrls[attempt];
    try {
      console.debug("safeFetch: attempting", url, "opts=", opts);
      const r = await doFetch(url);
      console.debug("safeFetch: success", url, r.status);
      return r;
    } catch (err: any) {
      console.warn("safeFetch: attempt failed", url, err && err.message ? err.message : err);
      lastErr = err;
      // small delay before next attempt
      await new Promise((res) => setTimeout(res, 150 * (attempt + 1)));
    }
  }

  // If all attempts failed, try a couple of simple retries on the original URL (and relative if possible)
  for (let retry = 0; retry < 2; retry++) {
    try {
      console.debug("safeFetch: final retry", retry + 1, "for", u);
      const r = await doFetch(u);
      console.debug("safeFetch: final retry success", u, r.status);
      return r;
    } catch (err: any) {
      console.warn("safeFetch: final retry failed", retry + 1, err && err.message ? err.message : err);
      lastErr = err;
      await new Promise((res) => setTimeout(res, 200 * (retry + 1)));
    }
  }

  // Last attempt: if the last error was a network/fetch error, throw a clearer message
  if (lastErr && lastErr instanceof Error && lastErr.message === "Failed to fetch") {
    const e: any = new Error(
      "Network error: unable to reach the backend. If you're running the preview, ensure the dev server or proxy is available."
    );
    e.cause = lastErr;
    throw e;
  }

  throw lastErr || new Error("Failed to fetch");
}

export async function fetchJsonSafe(url: string, opts?: RequestInit) {
  const r = await safeFetch(url, opts);
  const text = await r
    .clone()
    .text()
    .catch(() => "");

  const contentType = r.headers.get("content-type") || "";
  const looksLikeHtml =
    contentType.includes("text/html") ||
    text.trim().toLowerCase().startsWith("<!doctype");

  // If server responded OK but returned HTML (dev server SPA fallback), attempt several function-based fallbacks
  if (r.ok && looksLikeHtml) {
    try {
      const urlObj = new URL(url);
      if (urlObj.pathname.startsWith("/api/")) {
        const candidates = [
          urlObj.pathname.replace(/^\/api\//, "/.netlify/functions/api/"),
          urlObj.pathname.replace(/^\/api\//, "/.netlify/functions/"),
        ];
        for (const p of candidates) {
          try {
            const alt = new URL(p, urlObj.origin).toString();
            const r2 = await safeFetch(alt, opts);
            const text2 = await r2
              .clone()
              .text()
              .catch(() => "");
            const ct2 = r2.headers.get("content-type") || "";
            const looksLikeHtml2 =
              ct2.includes("text/html") ||
              String(text2).trim().toLowerCase().startsWith("<!doctype");
            if (!r2.ok || looksLikeHtml2) {
              // try next fallback
              continue;
            }
            try {
              return JSON.parse(text2);
            } catch (e) {
              continue;
            }
          } catch (e) {
            // continue to next candidate
            continue;
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  if (!r.ok) {
    const err: any = new Error(`Server error: ${r.status} ${text}`);
    err.status = r.status;
    err.body = text;
    throw err;
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    const err: any = new Error(
      `Invalid JSON response: ${String(text).slice(0, 500)}`,
    );
    err.status = r.status;
    err.body = text;
    throw err;
  }
}
