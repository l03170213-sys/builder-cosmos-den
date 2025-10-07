export async function safeFetch(u: string, opts?: RequestInit) {
  const doFetch = async (url: string) => {
    // Use a safe set of options for cross-origin and credentialed requests
    const optsOnFetch: RequestInit = { ...opts };
    if (!optsOnFetch.mode) optsOnFetch.mode = "cors";
    // default credentials: same-origin for same-origin requests, omit for cross-origin to avoid CORS credential issues
    try {
      const urlObjTemp = new URL(
        url,
        typeof window !== "undefined" ? window.location.origin : undefined,
      );
      const isSameOrigin =
        typeof window !== "undefined"
          ? urlObjTemp.origin === window.location.origin
          : true;
      if (optsOnFetch.credentials === undefined)
        optsOnFetch.credentials = isSameOrigin ? "same-origin" : "omit";
    } catch (e) {
      if (optsOnFetch.credentials === undefined)
        optsOnFetch.credentials = "same-origin";
    }
    // avoid cached stale responses during retries
    if (!optsOnFetch.cache) optsOnFetch.cache = "no-store";

    // For same-origin API requests prefer XHR to avoid interference from libraries
    // that wrap/override window.fetch (e.g. FullStory). Otherwise prefer native fetch.
    try {
      let usedXhrFirst = false;
      try {
        const urlObjTemp = new URL(url, typeof window !== 'undefined' ? window.location.origin : undefined);
        const isSameOrigin = typeof window !== 'undefined' ? urlObjTemp.origin === window.location.origin : true;
        if (isSameOrigin && urlObjTemp.pathname.startsWith('/api/')) {
          usedXhrFirst = true;
          // Use XHR directly
          return await new Promise<any>((resolve, reject) => {
            try {
              const xhr = new XMLHttpRequest();
              xhr.open((optsOnFetch.method as string) || 'GET', url, true);

              // Apply headers if provided
              const hdrs = optsOnFetch.headers as Record<string, string> | undefined;
              if (hdrs && typeof hdrs === 'object') {
                for (const k of Object.keys(hdrs)) {
                  try { xhr.setRequestHeader(k, (hdrs as any)[k]); } catch (e) {}
                }
              }

              xhr.withCredentials = optsOnFetch.credentials === 'include' || optsOnFetch.credentials === 'same-origin';

              xhr.onload = () => {
                const headersMap = {
                  get: (name: string) => {
                    const v = xhr.getResponseHeader(name);
                    return v ? v : null;
                  },
                };
                const res = {
                  ok: xhr.status >= 200 && xhr.status < 300,
                  status: xhr.status || 0,
                  headers: headersMap,
                  text: () => Promise.resolve(typeof xhr.responseText === 'string' ? xhr.responseText : ''),
                  clone: function () { return this; },
                };
                resolve(res);
              };

              xhr.onerror = () => reject(new Error('Network error (XHR)'));
              xhr.onabort = () => reject(new Error('Request aborted'));

              if (optsOnFetch.body) {
                try { xhr.send(optsOnFetch.body as Document | BodyInit | null); } catch (e) { xhr.send(); }
              } else {
                xhr.send();
              }
            } catch (e) { reject(e); }
          });
        }
      } catch (e) {
        // ignore URL parse errors and fall back to fetch
      }

      // Prefer the original native fetch if available (captured before wrappers like FullStory)
      const fetchFunc: typeof fetch = (typeof (globalThis as any).__originalFetch === 'function') ? (globalThis as any).__originalFetch : fetch;
      const r = await fetchFunc(url, optsOnFetch as any);
      return r;
    } catch (err) {
      // If fetch fails (network/CORS or a script overriding fetch), attempt an XHR fallback
      try {
        return await new Promise<any>((resolve, reject) => {
          try {
            const xhr = new XMLHttpRequest();
            xhr.open((optsOnFetch.method as string) || 'GET', url, true);

            // Apply headers if provided
            const hdrs = optsOnFetch.headers as Record<string, string> | undefined;
            if (hdrs && typeof hdrs === 'object') {
              for (const k of Object.keys(hdrs)) {
                try { xhr.setRequestHeader(k, (hdrs as any)[k]); } catch (e) {}
              }
            }

            xhr.withCredentials = optsOnFetch.credentials === 'include' || optsOnFetch.credentials === 'same-origin';

            xhr.onload = () => {
              const headersMap = {
                get: (name: string) => {
                  const v = xhr.getResponseHeader(name);
                  return v ? v : null;
                },
              };
              const res = {
                ok: xhr.status >= 200 && xhr.status < 300,
                status: xhr.status || 0,
                headers: headersMap,
                text: () => Promise.resolve(typeof xhr.responseText === 'string' ? xhr.responseText : ''),
                clone: function () { return this; },
              };
              resolve(res);
            };

            xhr.onerror = () => reject(new Error('Network error (XHR)'));
            xhr.onabort = () => reject(new Error('Request aborted'));

            if (optsOnFetch.body) {
              try { xhr.send(optsOnFetch.body as Document | BodyInit | null); } catch (e) { xhr.send(); }
            } else {
              xhr.send();
            }
          } catch (e) { reject(e); }
        });
      } catch (e2) {
        throw err;
      }
    }
  };

  const tryUrls: string[] = [];
  try {
    const urlObj = new URL(
      u,
      typeof window !== "undefined" ? window.location.origin : undefined,
    );
    // If cross-origin, try a relative path first (some previews/proxies rewrite requests)
    if (
      typeof window !== "undefined" &&
      urlObj.origin !== window.location.origin
    ) {
      if (urlObj.pathname.startsWith("/api/")) {
        tryUrls.push(urlObj.pathname + urlObj.search);
      }
      // then original absolute URL
      tryUrls.push(u);
      // add Netlify functions alternative
      if (urlObj.pathname.startsWith("/api/")) {
        const altPath = urlObj.pathname.replace(
          /^\/api\//,
          "/.netlify/functions/api/",
        );
        const alt = new URL(altPath, urlObj.origin).toString();
        tryUrls.push(alt);
      }
    } else {
      // same-origin: prefer the given URL then fallbacks
      tryUrls.push(u);
      if (urlObj.pathname.startsWith("/api/")) {
        const altPath = urlObj.pathname.replace(
          /^\/api\//,
          "/.netlify/functions/api/",
        );
        const alt = new URL(altPath, urlObj.origin).toString();
        tryUrls.push(alt);
        tryUrls.push(urlObj.pathname + urlObj.search);
      }
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
      console.warn(
        "safeFetch: attempt failed",
        url,
        err && err.message ? err.message : err,
      );
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
      console.warn(
        "safeFetch: final retry failed",
        retry + 1,
        err && err.message ? err.message : err,
      );
      lastErr = err;
      await new Promise((res) => setTimeout(res, 200 * (retry + 1)));
    }
  }

  // Last attempt: if the last error was a network/fetch error, throw a clearer message
  if (lastErr) {
    const isTypeError =
      (lastErr instanceof Error &&
        (lastErr.message === "Failed to fetch" ||
          lastErr.name === "TypeError")) ||
      String(lastErr).includes("Failed to fetch") ||
      String(lastErr).toLowerCase().includes("networkerror") ||
      String(lastErr).toLowerCase().includes("network error");
    if (isTypeError) {
      const e: any = new Error(
        "Network error: unable to reach the backend. Ensure the backend (dev server, functions or proxy) is available, the base URL is correct, and CORS/proxy settings allow requests.",
      );
      e.cause = lastErr;
      // include helpful diagnostics when available
      try {
        if (typeof window !== "undefined") {
          e.diagnostics = { windowOrigin: window.location.origin };
        }
      } catch (ex) {}
      throw e;
    }
  }

  // Fallback: always throw a sanitized error (avoid throwing raw TypeError from fetch which can be confusing)
  const finalErr: any =
    lastErr instanceof Error
      ? new Error(`Request failed: ${lastErr.message}`)
      : new Error("Request failed");
  finalErr.cause = lastErr;
  throw finalErr;
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
      const urlObj = new URL(
        url,
        typeof window !== "undefined" ? window.location.origin : undefined,
      );
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
