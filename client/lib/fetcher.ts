export async function safeFetch(u: string, opts?: RequestInit) {
  const doFetch = async (url: string) => {
    const r = await fetch(url, opts);
    return r;
  };

  try {
    return await doFetch(u);
  } catch (err: any) {
    const msg = (err && err.message) ? String(err.message).toLowerCase() : '';
    if (msg.includes('failed to fetch') || msg.includes('networkerror')) {
      try {
        const urlObj = new URL(u);
        if (urlObj.pathname.startsWith('/api/')) {
          const altPath = urlObj.pathname.replace(/^\/api\//, '/.netlify/functions/api/');
          const alt = new URL(altPath, urlObj.origin).toString();
          return await doFetch(alt);
        }
      } catch (e) {
        // ignore
      }
    }
    throw err;
  }
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
