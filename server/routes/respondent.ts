import type { RequestHandler } from 'express';

const SHEET_ID = '1jO4REgqWiXeh3U9e2uueRoLsviB0o64Li5d39Fp38os';
const GID_MATRICE_MOYENNE = '1595451985';

function parseGviz(text: string) {
  const start = text.indexOf('(');
  const end = text.lastIndexOf(')');
  const json = text.slice(start + 1, end);
  return JSON.parse(json);
}

function cellToString(c: any) {
  if (!c) return '';
  if (typeof c === 'string') return c;
  if (typeof c === 'number') return String(c);
  if (c && typeof c === 'object' && c.v != null) return String(c.v);
  return '';
}

function formatDateToFR(raw: string) {
  if (!raw) return '';
  const s = raw.toString().trim();
  const dateWithTimeMatch = s.match(/^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+/);
  if (dateWithTimeMatch) return dateWithTimeMatch[1];
  const dmY = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmY) return `${dmY[1].padStart(2, '0')}/${dmY[2].padStart(2, '0')}/${dmY[3].length===2? '20'+dmY[3]:dmY[3]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
  const num = Number(s);
  if (!Number.isNaN(num) && num > 0) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const dt2 = new Date(excelEpoch.getTime() + Math.round(num) * 24 * 60 * 60 * 1000);
    return `${String(dt2.getUTCDate()).padStart(2,'0')}/${String(dt2.getUTCMonth()+1).padStart(2,'0')}/${dt2.getUTCFullYear()}`;
  }
  return s;
}

export const getResortRespondentDetails: RequestHandler = async (req, res) => {
  try {
    const qEmail = (req.query.email || '').toString().trim().toLowerCase();
    const qName = (req.query.name || '').toString().trim().toLowerCase();
    const qDate = (req.query.date || '').toString().trim();

    const gurl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID_MATRICE_MOYENNE}`;
    const rr = await fetch(gurl);
    if (!rr.ok) return res.status(502).json({ error: 'Unable to fetch matrice' });
    const text = await rr.text();
    const json = parseGviz(text);
    const cols: string[] = (json.table.cols || []).map((c: any) => (c.label || '').toString());
    const rows: any[] = json.table.rows || [];

    // Try rows-as-respondents
    const targetDate = qDate ? formatDateToFR(qDate) : '';
    const candidateRowIdxs: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const c = r.c || [];
      // scan all cells in the row to find exact or partial email/name match
      let matched = false;
      for (let ci = 0; ci < c.length; ci++) {
        const cellVal = c[ci] && c[ci].v != null ? String(c[ci].v).trim().toLowerCase() : '';
        if (!cellVal) continue;
        if (cellVal === qEmail || cellVal === qName) { matched = true; break; }
        // allow partial matches (e.g. header contains email with additional text)
        if (qEmail && cellVal.includes(qEmail)) { matched = true; break; }
        if (qName && cellVal.includes(qName)) { matched = true; break; }
      }
      if (matched) candidateRowIdxs.push(i);
    }

    const result = { categories: null as null | { name: string; value: string }[], overall: null as null | string, column: null as null | string };

    if (candidateRowIdxs.length >= 1) {
      let chosenIdx = -1;
      if (candidateRowIdxs.length === 1) chosenIdx = candidateRowIdxs[0];
      else {
        for (const idx of candidateRowIdxs) {
          const row = rows[idx];
          const cells = row.c || [];
          const hasDateMatch = cells.some((cell: any) => formatDateToFR(cellToString(cell)) === targetDate && targetDate !== '');
          if (hasDateMatch) { chosenIdx = idx; break; }
        }
        if (chosenIdx === -1) chosenIdx = candidateRowIdxs[0];
      }

      const row = rows[chosenIdx];
      const cells = row.c || [];
      const lastCellIdx = Math.max(0, cells.length - 1);
      // Determine overall index: prefer column 11 (L) if present and non-empty, otherwise use last column available
      let overallIndex = 11;
      if (!(cells[11] && cells[11].v != null)) {
        overallIndex = Math.max(0, Math.min(cols.length - 1, lastCellIdx));
      }

      const cats: { name: string; value: string }[] = [];
      for (let i = 1; i <= lastCellIdx; i++) {
        if (i === overallIndex) continue;
        const catName = (cols[i] && cols[i] !== '') ? cols[i] : `Col ${i + 1}`;
        const val = cells[i] && cells[i].v != null ? String(cells[i].v) : '';
        cats.push({ name: catName, value: val });
      }

      const overallCell = (cells[overallIndex] && cells[overallIndex].v != null) ? cells[overallIndex] : null;
      const overall = overallCell ? String(overallCell.v) : null;

      result.categories = cats;
      result.overall = overall;
      result.column = null;

      return res.status(200).json(result);
    }

    // Try cols-as-respondents: find column index
    let colIndex = -1;
    for (let i = 0; i < cols.length; i++) {
      const lbl = (cols[i] || '').toString().trim().toLowerCase();
      if (!lbl) continue;
      if (lbl === qEmail || lbl === qName) { colIndex = i; break; }
    }
    if (colIndex === -1) {
      for (let i = 0; i < cols.length; i++) {
        const lbl = (cols[i] || '').toString().trim().toLowerCase();
        if (!lbl) continue;
        if (qEmail && lbl.includes(qEmail)) { colIndex = i; break; }
        if (qName && lbl.includes(qName)) { colIndex = i; break; }
      }
    }

    if (colIndex !== -1) {
      const cats: { name: string; value: string }[] = [];
      for (const r of rows) {
        const cells = r.c || [];
        const catName = cells[0] && cells[0].v != null ? String(cells[0].v) : '';
        const val = cells[colIndex] && cells[colIndex].v != null ? String(cells[colIndex].v) : '';
        if (catName) cats.push({ name: catName, value: val });
      }
      const lastRow = rows[rows.length - 1];
      const overallCell = lastRow && lastRow.c && lastRow.c[colIndex];
      const overall = overallCell && overallCell.v != null ? String(overallCell.v) : null;
      result.categories = cats;
      result.overall = overall;
      result.column = (function(i){
        let col=''; let n=i+1; while(n>0){ const rem=(n-1)%26; col=String.fromCharCode(65+rem)+col; n=Math.floor((n-1)/26);} return col;
      })(colIndex);

      return res.status(200).json(result);
    }

    return res.status(404).json({ error: 'Respondent not found in matrice' });
  } catch (err) {
    console.error('Failed to fetch respondent details:', err);
    return res.status(500).json({ error: 'Unable to load respondent details' });
  }
};
