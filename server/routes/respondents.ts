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

// Normalize a header label: remove punctuation/spaces and lowercase to match variants like "Âges :"
function normalizeLabel(s: string) {
  if (!s) return '';
  // keep letters and numbers, remove punctuation and spaces
  try {
    return s.toString().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
  } catch (e) {
    return s.toString().toLowerCase().replace(/[^a-z0-9]+/gi, '');
  }
}

export const getResortRespondents: RequestHandler = async (_req, res) => {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: 'Unable to fetch sheet1' });
    const text = await r.text();
    const parsed = parseGviz(text);
    const cols: string[] = (parsed.table.cols || []).map((c: any) => (c.label || '').toString().toLowerCase());
    const rows: any[] = parsed.table.rows || [];

    // guess indices
    const idxName = cols.findIndex((c) => c.includes('nom') || c.includes('name'));
    const idxEmail = cols.findIndex((c) => c.includes('mail') || c.includes('email'));
    const idxNote = (cols[11] != null && cols[11] !== '') ? 11 : cols.findIndex((c) => c.includes('note') || c.includes('rating'));
    let idxDate = cols.findIndex((c) => c.includes('submitted at') || c.includes('submitted') || c.includes('timestamp'));
    if (idxDate === -1) idxDate = cols.findIndex((c) => c.includes('date'));
    const idxPostal = cols.findIndex((c) => c.includes('postal') || c.includes('code postal') || c.includes('zipcode') || c.includes('zip'));
    const idxDuration = cols.findIndex((c) => c.includes('dur') || c.includes('duree') || c.includes('durée') || c.includes('duration'));
    const idxFeedback = cols.findIndex((c) => c.includes('votre avis') || c.includes('votre avis compte') || c.includes('commentaire') || c.includes('feedback') || c.includes('votre avis'));
    const idxAge = cols.findIndex((c) => c.includes('âge') || c.includes('age') || c.includes('âges') || c.includes('ages'));

    let items = rows.map((rrow: any) => {
      const c = rrow.c || [];
      return {
        name: cellToString(c[idxName]) || cellToString(c[0]) || '',
        email: cellToString(c[idxEmail]) || '',
        note: cellToString(c[idxNote]) || '',
        date: cellToString(c[idxDate]) || '',
        postal: cellToString(c[idxPostal]) || '',
        duration: cellToString(c[idxDuration]) || '',
        age: cellToString(c[idxAge]) || '',
        feedback: cellToString(c[idxFeedback]) || '',
      };
    }).filter((it) => it.email || it.note || it.date || it.postal || it.duration || it.feedback || it.age);

    // Try to augment using matrice moyenne
    try {
      const mgurl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID_MATRICE_MOYENNE}`;
      const mr = await fetch(mgurl);
      if (mr.ok) {
        const mtext = await mr.text();
        const start = mtext.indexOf('(');
        const end = mtext.lastIndexOf(')');
        const mjson = JSON.parse(mtext.slice(start + 1, end));
        const mcols: string[] = (mjson.table.cols || []).map((c: any) => (c.label || '').toString());
        const mrows: any[] = mjson.table.rows || [];
        const lastRow = mrows[mrows.length - 1];

        // usage map to disambiguate multiple matches per respondent (email/name)
        const usageCount = new Map<string, number>();

        const getNoteFromMatrice = (resp: any) => {
          if (!mrows || mrows.length === 0) return null;
          const targetEmail = resp.email ? String(resp.email).trim().toLowerCase() : '';
          const targetName = resp.name ? String(resp.name).trim().toLowerCase() : '';
          const targetDate = formatDateToFR(resp.date || '');

          // Scenario A: rows are respondents
          const candidateRowIdxs: number[] = [];
          for (let i = 0; i < mrows.length; i++) {
            const r = mrows[i];
            const c = r.c || [];
            const first = c[0] && c[0].v != null ? String(c[0].v).trim().toLowerCase() : '';
            if (!first) continue;
            if (first === targetEmail || first === targetName) candidateRowIdxs.push(i);
          }
          if (candidateRowIdxs.length === 1) {
            const row = mrows[candidateRowIdxs[0]];
            const cells = row.c || [];
            const overallCell = (cells[11] && cells[11].v != null) ? cells[11] : cells[mcols.length - 1];
            return cellToString(overallCell) || null;
          }
          if (candidateRowIdxs.length > 1) {
            // try disambiguate by date
            for (const idx of candidateRowIdxs) {
              const row = mrows[idx];
              const cells = row.c || [];
              const foundDate = cells.some((cell: any) => formatDateToFR(cellToString(cell)) === targetDate && targetDate !== '');
              if (foundDate) {
                const cells = row.c || [];
                const overallCell = (cells[11] && cells[11].v != null) ? cells[11] : cells[mcols.length - 1];
                return cellToString(overallCell) || null;
              }
            }
            // if still multiple, assign per-occurrence using usageCount
            const key = targetEmail || targetName || '##';
            const used = usageCount.get(key) || 0;
            const chosenIdx = candidateRowIdxs[used] ?? candidateRowIdxs[0];
            usageCount.set(key, used + 1);
            const row = mrows[chosenIdx];
            const cells = row.c || [];
            const overallCell = (cells[11] && cells[11].v != null) ? cells[11] : cells[mcols.length - 1];
            return cellToString(overallCell) || null;
          }

          // Scenario B: cols are respondents
          const candidateCols: number[] = [];
          for (let i = 0; i < mcols.length; i++) {
            const lbl = (mcols[i] || '').toString().trim().toLowerCase();
            if (!lbl) continue;
            if (lbl === targetEmail || lbl === targetName) { candidateCols.push(i); continue; }
            if (targetEmail && lbl.includes(targetEmail)) { candidateCols.push(i); continue; }
            if (targetName && lbl.includes(targetName)) { candidateCols.push(i); continue; }
          }

          let chosenCol = -1;
          if (candidateCols.length === 1) chosenCol = candidateCols[0];
          else if (candidateCols.length > 1) {
            for (const ci of candidateCols) {
              const lbl = (mcols[ci] || '').toString();
              if (formatDateToFR(lbl).replace(/\s/g, '') === targetDate.replace(/\s/g, '')) { chosenCol = ci; break; }
              if (lbl.includes(targetDate)) { chosenCol = ci; break; }
            }
            if (chosenCol === -1 && candidateCols.includes(11)) chosenCol = 11;
            if (chosenCol === -1) chosenCol = candidateCols[0];
          }

          if (chosenCol !== -1 && lastRow) {
            const valCell = lastRow.c && lastRow.c[chosenCol];
            return cellToString(valCell) || null;
          }

          return null;
        };

        // map items sequentially so usageCount assignment works
        items = items.map((it) => {
          const fromM = getNoteFromMatrice(it);
          if (fromM) return { ...it, note: fromM };
          return it;
        });
      }
    } catch (err) {
      console.error('Failed to augment notes from matrice:', err);
    }

    return res.status(200).json(items);
  } catch (err) {
    console.error('Failed to fetch respondents:', err);
    return res.status(500).json({ error: 'Unable to load respondents' });
  }
};
