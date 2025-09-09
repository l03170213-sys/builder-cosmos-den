export async function safeFetch(u: string, opts?: RequestInit) {
  const doFetch = async (url: string) => {
    const r = await fetch(url, opts);
    return r;
  };

  const tryUrls: string[] = [];
  try {
    const urlObj = new URL(u);
    tryUrls.push(u);
    if (urlObj.pathname.startsWith('/api/')) {
      // add Netlify functions alternative
      const altPath = urlObj.pathname.replace(/^\/api\//, '/.netlify/functions/api/');
      const alt = new URL(altPath, urlObj.origin).toString();
      tryUrls.unshift(alt); // prefer alt first
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
      const r = await doFetch(url);
      return r;
    } catch (err: any) {
      lastErr = err;
      // small delay before next attempt
      await new Promise((res) => setTimeout(res, 150 * (attempt + 1)));
    }
  }

  // If all attempts failed, try a couple of simple retries on the original URL
  for (let retry = 0; retry < 2; retry++) {
    try {
      const r = await doFetch(u);
      return r;
    } catch (err: any) {
      lastErr = err;
      await new Promise((res) => setTimeout(res, 200 * (retry + 1)));
    }
  }

  throw lastErr || new Error('Failed to fetch');
}

export async function fetchJsonSafe(url: string, opts?: RequestInit) {
  const r = await safeFetch(url, opts);
  const text = await r.clone().text().catch(() => '');
  if (!r.ok) {
    const err: any = new Error(`Server error: ${r.status} ${text}`);
    err.status = r.status;
    err.body = text;
    throw err;
  }
  try { return JSON.parse(text); } catch (e) { const err: any = new Error(`Invalid JSON response: ${String(text).slice(0,500)}`); err.status = r.status; err.body = text; throw err; }
}
