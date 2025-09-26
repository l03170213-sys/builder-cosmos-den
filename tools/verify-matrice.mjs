import fetch from 'node-fetch';

const BASE = process.env.BASE_URL || 'https://74e203eadb25449595dedfc10bccc18d-9cb45444228a4b0d9f1325d61.fly.dev';

const resorts = [
  "vm-resort-albanie",
  "alvor-baia-portugal",
  "sineva-park-bulgarie",
  "morenia-croatie",
  "medena-croatie",
  "riviera-malte",
  "top-club-cocoon-salini",
  "aquasun-village-crete",
  "atlantica-oasis-chypre",
  "monchique-portugal",
  "dom-pedro-madeira",
  "gabbiano-italie",
  "albatros-croatie",
  "delphin-montenegro",
  "pestana-royal-ocean-madeira",
  "ariel-cala-dor-majorque",
  "h-tel-baia-malva-italie",
];

function safeLog(...args) { console.log(...args); }

async function checkRespondent(resort, respondent) {
  const params = new URLSearchParams();
  if (respondent.email) params.set('email', respondent.email);
  if (respondent.name) params.set('name', respondent.name);
  if (respondent.date) params.set('date', respondent.date);
  const url = `${BASE}/api/resort/${resort}/respondent?${params.toString()}&debug=1`;
  try {
    const r = await fetch(url, { credentials: 'same-origin' });
    if (!r.ok) return { ok: false, status: r.status, url };
    const json = await r.json();
    // Evaluate: categories should exist and belong to respondent
    const categories = Array.isArray(json.categories) ? json.categories : null;
    const overall = json.overall ?? null;
    const column = json.column ?? null;
    const nameFromApi = (json.name || (categories && categories[0] && categories[0].value) || null);
    const nameMatch = respondent.name ? (String(respondent.name).trim() === String(nameFromApi).trim()) : true;

    const hasAnyCategory = categories && categories.some(c => c && String(c.value || '').trim() !== '');

    return { ok: true, data: json, categoriesCount: categories ? categories.length : 0, hasAnyCategory, overall, column, nameFromApi, nameMatch };
  } catch (e) {
    return { ok: false, error: String(e), url };
  }
}

async function run() {
  const report = [];
  for (const resort of resorts) {
    safeLog('\nChecking resort:', resort);
    const listUrl = `${BASE}/api/resort/${resort}/respondents?page=1&pageSize=10`;
    try {
      const lr = await fetch(listUrl, { credentials: 'same-origin' });
      if (!lr.ok) {
        safeLog('  Failed to fetch respondents list:', lr.status);
        report.push({ resort, error: `respondents fetch status ${lr.status}` });
        continue;
      }
      const listJson = await lr.json().catch(() => null);
      if (!listJson || !Array.isArray(listJson.items)) {
        safeLog('  Invalid respondents payload');
        report.push({ resort, error: 'invalid respondents payload' });
        continue;
      }
      const items = listJson.items.slice(0, 10);
      if (items.length === 0) {
        safeLog('  No respondents found (empty list)');
        report.push({ resort, note: 'no respondents' });
        continue;
      }
      // check up to 5 respondents
      const sample = items.slice(0, 5);
      for (const r of sample) {
        const res = await checkRespondent(resort, r);
        if (!res.ok) {
          safeLog(`  Respondent ${r.name || r.email || 'unknown'}: API error`, res);
          report.push({ resort, respondent: r.name || r.email || 'unknown', ok: false, reason: res.status || res.error });
        } else {
          // Determine expected: if column present or hasAnyCategory true -> success
          const success = res.hasAnyCategory || (res.column !== null && res.overall !== null);
          if (!success) {
            safeLog(`  Respondent ${r.name || r.email || 'unknown'}: NO per-respondent categories found (possible matrice mismatch)`);
            report.push({ resort, respondent: r.name || r.email || 'unknown', ok: false, details: res });
          } else {
            safeLog(`  Respondent ${r.name || r.email || 'unknown'}: OK (categoriesCount=${res.categoriesCount}, column=${res.column})`);
            report.push({ resort, respondent: r.name || r.email || 'unknown', ok: true, details: { categoriesCount: res.categoriesCount, column: res.column } });
          }
        }
      }
    } catch (e) {
      safeLog('  Error fetching respondents:', String(e));
      report.push({ resort, error: String(e) });
    }
  }

  // Summarize
  const failures = report.filter(r => r.ok === false || r.error);
  safeLog('\n=== Verification complete ===');
  safeLog('Total checks:', report.length);
  safeLog('Failures / Problems:', failures.length);
  if (failures.length > 0) {
    safeLog(JSON.stringify(failures.slice(0, 50), null, 2));
    process.exitCode = 2;
  } else {
    safeLog('All sampled respondents across resorts returned per-respondent categories or overall values.');
    process.exitCode = 0;
  }
}

run().catch(e => { console.error(e); process.exit(1); });
