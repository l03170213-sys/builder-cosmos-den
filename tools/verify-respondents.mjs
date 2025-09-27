#!/usr/bin/env node
// Verify per-respondent category averages mapping for all resorts
// Usage: node tools/verify-respondents.mjs --baseUrl http://localhost:5173 [--only vm-resort-albanie,medena-croatie]

import fs from 'fs/promises';
import process from 'process';

const args = process.argv.slice(2);
let baseUrl = null;
let onlyList = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--baseUrl' && args[i+1]) { baseUrl = args[i+1]; i++; }
  else if (args[i] === '--only' && args[i+1]) { onlyList = args[i+1].split(',').map(s=>s.trim()).filter(Boolean); i++; }
}
if (!baseUrl) baseUrl = process.env.BASE_URL || 'http://localhost:5173';

function normalize(s) {
  if (!s) return '';
  try { return s.toString().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/\s+/g,' ').trim().toLowerCase(); } catch(e) { return s.toString().trim().toLowerCase(); }
}

async function readResortKeys() {
  const txt = await fs.readFile('server/resorts.ts', 'utf8');
  const re = /"([a-z0-9\-_.]+)":\s*{\s*sheetId:/gmi;
  const keys = [];
  let m;
  while ((m = re.exec(txt)) !== null) keys.push(m[1]);
  return keys;
}

async function fetchJson(url) {
  const resp = await fetch(url, { method: 'GET' });
  const txt = await resp.text();
  try { return { ok: resp.ok, data: JSON.parse(txt), status: resp.status }; } catch(e) { return { ok: resp.ok, data: null, status: resp.status, text: txt }; }
}

(async () => {
  console.log('Base URL:', baseUrl);
  const resortsAll = await readResortKeys();
  let resorts = resortsAll;
  if (onlyList && onlyList.length) {
    resorts = resortsAll.filter(r => onlyList.includes(r));
    if (resorts.length === 0) {
      console.error('No matching resorts found for --only list. Available:', resortsAll.join(', '));
      process.exit(2);
    }
  }

  console.log('Resorts to check:', resorts.join(', '));

  const failures = [];

  for (const resort of resorts) {
    console.log('\n=== Resort:', resort, '===');
    const listUrl = `${baseUrl.replace(/\/$/, '')}/api/resort/${resort}/respondents?page=1&pageSize=500`;
    const listResp = await fetchJson(listUrl);
    if (!listResp.ok || !listResp.data || !Array.isArray(listResp.data.items)) {
      console.error('Failed to fetch respondents for', resort, 'status', listResp.status);
      failures.push({ resort, error: 'list_fetch_failed', details: listResp });
      continue;
    }
    const items = listResp.data.items;
    console.log('Respondents:', items.length);
    for (const r of items) {
      const displayName = (r.name || r.label || r.email || '').toString();
      const email = r.email || '';
      const name = r.name || r.label || '';
      const date = r.date || '';
      const key = r.id != null ? `id:${r.id}` : `${displayName}`;

      let passes = true;
      const iterationFailures = [];
      for (let iter = 1; iter <= 5; iter++) {
        const params = new URLSearchParams();
        if (email) params.set('email', email);
        if (name) params.set('name', name);
        if (date) params.set('date', date);
        const url = `${baseUrl.replace(/\/$/, '')}/api/resort/${resort}/respondent?${params.toString()}`;
        const resp = await fetchJson(url);
        if (!resp.ok || !resp.data) {
          passes = false;
          iterationFailures.push({ iter, reason: 'fetch_failed', status: resp.status, body: resp.data || resp.text });
          await new Promise(res => setTimeout(res, 200));
          continue;
        }
        const d = resp.data;
        if (!Array.isArray(d.categories)) {
          passes = false;
          iterationFailures.push({ iter, reason: 'no_categories', body: d });
          await new Promise(res => setTimeout(res, 200));
          continue;
        }
        const nomEntry = d.categories.find(c => /^(nom|name|client)$/i.test((c.name || '').toString().trim()) ) || d.categories.find(c => /nom|name|client/i.test((c.name||'').toString()));
        if (nomEntry && normalize(nomEntry.value) && (normalize(displayName) && (normalize(nomEntry.value).includes(normalize(displayName)) || normalize(displayName).includes(normalize(nomEntry.value))))) {
          // ok
        } else {
          const numericCount = d.categories.reduce((acc, c) => acc + (/^-?\d+(?:[.,]\d+)?$/.test(String(c.value||'').trim()) ? 1 : 0), 0);
          if (numericCount === 0) {
            passes = false;
            iterationFailures.push({ iter, reason: 'nom_mismatch_and_no_numeric', returnedCategories: d.categories.slice(0,6) });
          }
        }
        await new Promise(res => setTimeout(res, 100));
      }

      if (!passes) {
        failures.push({ resort, respondentKey: key, name: displayName, failures: iterationFailures });
        console.error('FAIL:', resort, key, 'iterations failures:', iterationFailures.length);
      } else {
        process.stdout.write('.');
      }
    }
  }

  console.log('\n\nDone.');
  if (failures.length) {
    console.log('Failures found:', failures.length);
    await fs.writeFile('verify-respondents-report.json', JSON.stringify({ baseUrl, timestamp: Date.now(), failures }, null, 2), 'utf8');
    console.log('Detailed report written to verify-respondents-report.json');
    process.exit(1);
  } else {
    console.log('All checks passed for all selected resorts (5 iterations each respondent).');
    process.exit(0);
  }
})().catch(err => { console.error('Script error:', err); process.exit(2); });
