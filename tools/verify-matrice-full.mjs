const BASE = process.env.BASE_URL || 'http://localhost:8080';

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

async function fetchAllRespondents(resort) {
  const all = [];
  let page = 1;
  const pageSize = 500;
  while (true) {
    const url = `${BASE}/api/resort/${resort}/respondents?page=${page}&pageSize=${pageSize}`;
    const r = await fetch(url);
    if (!r.ok) break;
    const j = await r.json().catch(() => null);
    if (!j || !Array.isArray(j.items)) break;
    all.push(...j.items);
    if (all.length >= (j.total || 0)) break;
    page++;
    if (page > 50) break;
  }
  return all;
}

function getRowKey(row) {
  if (!row) return '';
  if (row.id != null) return `id:${row.id}`;
  if (row.email && row.date) return `e:${String(row.email).toLowerCase()}|d:${String(row.date)}`;
  if (row.email) return `e:${String(row.email).toLowerCase()}`;
  return `n:${String(row.name || '').trim().toLowerCase()}|${String(row.date || '')}`;
}

async function checkRespondent(resort, respondent) {
  const params = new URLSearchParams();
  if (respondent.email) params.set('email', respondent.email);
  if (respondent.name) params.set('name', respondent.name);
  if (respondent.date) params.set('date', respondent.date);
  const url = `${BASE}/api/resort/${resort}/respondent?${params.toString()}&debug=1`;
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, status: r.status, url };
    const json = await r.json();
    const categories = Array.isArray(json.categories) ? json.categories : null;
    const hasAnyCategory = categories && categories.some(c => c && String(c.value || '').trim() !== '');
    return { ok: true, data: json, categoriesCount: categories ? categories.length : 0, hasAnyCategory, url };
  } catch (e) {
    return { ok: false, error: String(e), url };
  }
}

async function run() {
  const failures = [];
  for (const resort of resorts) {
    safeLog('\nScanning resort:', resort);
    const respondents = await fetchAllRespondents(resort);
    if (!respondents || respondents.length === 0) { safeLog('  No respondents'); failures.push({ resort, reason: 'no-respondents' }); continue; }
    safeLog(`  Found ${respondents.length} respondents`);
    for (let i = 0; i < respondents.length; i++) {
      const r = respondents[i];
      const res = await checkRespondent(resort, r);
      if (!res.ok) {
        failures.push({ resort, respondent: r.name || r.email || `idx:${i}`, reason: res.status || res.error, url: res.url });
      } else {
        if (!res.hasAnyCategory) {
          failures.push({ resort, respondent: r.name || r.email || `idx:${i}`, reason: 'no-category', details: res.data, url: res.url });
        }
      }
    }
  }
  safeLog('\nFull scan complete. Failures:', failures.length);
  if (failures.length) {
    console.log(JSON.stringify(failures.slice(0,200), null, 2));
    process.exitCode = 2;
  } else {
    safeLog('All respondents have per-respondent categories or overall values.');
  }
}

run().catch(e => { console.error(e); process.exit(1); });
