import type { RequestHandler } from "express";
import { RESORTS } from "../resorts";

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

export const getResortRespondents: RequestHandler = async (req, res) => {
  try {
    const resortKey = req.params.resort as string;
    const cfg = RESORTS[resortKey];
    if (!cfg) return res.status(404).json({ error: 'Unknown resort' });

    const SHEET_ID = cfg.sheetId;

    const gurl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
    const rr = await fetch(gurl);
    if (!rr.ok) return res.status(502).json({ error: 'Unable to fetch sheet' });
    const text = await rr.text();
    const json = parseGviz(text);
    const cols: string[] = (json.table.cols || []).map((c: any) => (c.label || '').toString());
    const rows: any[] = (json.table.rows || []) as any[];

    // Determine column indices using heuristics that match VM Resort expectations
    const findCol = (keywords: string[]) => {
      const lower = cols.map(c => (c || '').toString().toLowerCase());
      for (let k of keywords) {
        for (let i = 0; i < lower.length; i++) {
          if (lower[i].includes(k)) return i;
        }
      }
      return -1;
    };

    const normalizeHeader = (s: string) => (s || '').toString().replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const TARGET_FEEDBACK_TITLE = 'Votre avis compte pour nous ! :)';
    const feedbackColExact = cols.findIndex(c => normalizeHeader(c) === normalizeHeader(TARGET_FEEDBACK_TITLE));

    const emailCol = findCol(['email', 'courriel', '@']);
    const noteCol = findCol(['note', 'moyenne', 'overall', 'note général', 'note generale', 'note générale']);
    const dateCol = findCol(['date']);
    const ageCol = findCol(['age']);
    const postalCol = findCol(['postal', 'code postal', 'postcode', 'zip']);
    const durationCol = findCol(['durée', 'duree', 'duration', 'séjour', 'sejour']);
    const feedbackCol = findCol(['comment', 'commentaire', 'feedback', 'remarque', 'votre avis', 'votre avis compte', 'votre avis compte pour nous', 'votre avis compte pour nous ! :)']);

    // Fallbacks: if noteCol not found, try column 11 (L) as in original heuristics
    let resolvedNoteCol = noteCol;
    if (resolvedNoteCol === -1 && cols.length > 11) resolvedNoteCol = 11;

    const respondents: any[] = [];
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const c = row.c || [];
      // skip empty rows
      const hasAny = (c || []).some((cell: any) => cell && cell.v != null && String(cell.v).toString().trim() !== '');
      if (!hasAny) continue;

      const obj: any = {};
      obj.id = r + 1;
      // Use fixed sheet1 columns: name in E (index 4), email in B (1), postal in I (8)
      obj.label = cellToString(c[4]);
      obj.email = cellToString(c[1]);
      obj.note = '';
      obj.date = dateCol !== -1 ? cellToString(c[dateCol]) : '';
      obj.age = ageCol !== -1 ? cellToString(c[ageCol]) : '';
      obj.postal = cellToString(c[8]);
      obj.duration = durationCol !== -1 ? cellToString(c[durationCol]) : '';
      // Prefer exact header match ("Votre avis compte pour nous ! :)") or BT (index 71) specifically; else fallback to known feedback column
      if (feedbackColExact !== -1) {
        obj.feedback = cellToString(c[feedbackColExact]);
      } else if (c[71] && c[71].v != null) {
        obj.feedback = cellToString(c[71]);
      } else if (feedbackCol !== -1) {
        obj.feedback = cellToString(c[feedbackCol]);
      } else {
        obj.feedback = '';
      }

      // If email empty, try to infer from label
      if (!obj.email && obj.label && obj.label.includes('@')) obj.email = obj.label;

      // alias for compatibility with client which expects 'name'
      obj.name = obj.label;
      respondents.push(obj);
    }

    // Try to enrich respondents with overall note from matrice sheet (column L / index 11)
    try {
      if (cfg.gidMatrice) {
        const mgurl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${cfg.gidMatrice}`;
        const mr = await fetch(mgurl);
        if (mr.ok) {
          const mtext = await mr.text();
          const mjson = parseGviz(mtext);
          const mcols: string[] = (mjson.table.cols || []).map((c: any) => (c.label || '').toString());
          const mrows: any[] = mjson.table.rows || [];

          // Build column-label map (lowercase) for cols-as-respondents scenario
          const colLabelLower = mcols.map(c => (c || '').toString().trim().toLowerCase());

          // For convenience, build a map of respondent email/name -> index in respondents array
          const byEmail: Record<string, number[]> = {};
          const byLabel: Record<string, number[]> = {};
          respondents.forEach((resp, idx) => {
            const e = (resp.email || '').toString().trim().toLowerCase();
            const l = (resp.label || '').toString().trim().toLowerCase();
            if (e) { byEmail[e] = byEmail[e] || []; byEmail[e].push(idx); }
            if (l) { byLabel[l] = byLabel[l] || []; byLabel[l].push(idx); }
          });

          // Try cols-as-respondents: if any column label matches an email or label
          let foundCols = false;
          for (let ci = 0; ci < colLabelLower.length; ci++) {
            const lbl = colLabelLower[ci];
            if (!lbl) continue;
            // exact match
            if (byEmail[lbl]) {
              for (const ridx of byEmail[lbl]) {
                // overall value usually is in the last row of the matrix for that column
                const lastRow = mrows[mrows.length - 1];
                const overallCell = lastRow && lastRow.c && lastRow.c[ci];
                respondents[ridx].note = overallCell && overallCell.v != null ? String(overallCell.v) : respondents[ridx].note;
              }
              foundCols = true;
              continue;
            }
            if (byLabel[lbl]) {
              for (const ridx of byLabel[lbl]) {
                const lastRow = mrows[mrows.length - 1];
                const overallCell = lastRow && lastRow.c && lastRow.c[ci];
                respondents[ridx].note = overallCell && overallCell.v != null ? String(overallCell.v) : respondents[ridx].note;
              }
              foundCols = true;
              continue;
            }
            // partial match: label includes email or name
            for (const eKey of Object.keys(byEmail)) {
              if (lbl.includes(eKey) && eKey) {
                for (const ridx of byEmail[eKey]) {
                  const lastRow = mrows[mrows.length - 1];
                  const overallCell = lastRow && lastRow.c && lastRow.c[ci];
                  respondents[ridx].note = overallCell && overallCell.v != null ? String(overallCell.v) : respondents[ridx].note;
                }
                foundCols = true;
              }
            }
            for (const lKey of Object.keys(byLabel)) {
              if (lbl.includes(lKey) && lKey) {
                for (const ridx of byLabel[lKey]) {
                  const lastRow = mrows[mrows.length - 1];
                  const overallCell = lastRow && lastRow.c && lastRow.c[ci];
                  respondents[ridx].note = overallCell && overallCell.v != null ? String(overallCell.v) : respondents[ridx].note;
                }
                foundCols = true;
              }
            }
          }

          // Always try rows-as-respondents to ensure 'Note général' is taken from column L (index 11)
          for (let ri = 0; ri < mrows.length; ri++) {
            const rrow = mrows[ri];
            const cells = rrow.c || [];
            // build lowercase cell string list
            const lowerCells = cells.map((cell: any) => (cell && cell.v != null ? String(cell.v).trim().toLowerCase() : ''));
            for (const [eKey, idxs] of Object.entries(byEmail)) {
              for (const idx of idxs) {
                if (lowerCells.includes(eKey)) {
                  // Note général is column L (index 11) per requirement
                  const overallIdx = 11 < cells.length ? 11 : Math.max(0, cells.length - 1);
                  const overallCell = cells[overallIdx];
                  respondents[idx].note = overallCell && overallCell.v != null ? String(overallCell.v) : respondents[idx].note;
                }
              }
            }
            for (const [lKey, idxs] of Object.entries(byLabel)) {
              for (const idx of idxs) {
                if (lowerCells.includes(lKey)) {
                  const overallIdx = 11 < cells.length ? 11 : Math.max(0, cells.length - 1);
                  const overallCell = cells[overallIdx];
                  respondents[idx].note = overallCell && overallCell.v != null ? String(overallCell.v) : respondents[idx].note;
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Failed to enrich respondents from matrice:', e);
    }

    // Fallback: if some respondents still have no note, try to map by row index to matrice (column L = index 11)
    try {
      if (cfg.gidMatrice) {
        const mgurl2 = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${cfg.gidMatrice}`;
        const mr2 = await fetch(mgurl2);
        if (mr2.ok) {
          const mtext2 = await mr2.text();
          const mjson2 = parseGviz(mtext2);
          const mrows2: any[] = mjson2.table.rows || [];
          for (let i = 0; i < respondents.length; i++) {
            if (respondents[i].note && respondents[i].note !== '') continue;
            const mrow = mrows2[i];
            if (!mrow) continue;
            const mcells = mrow.c || [];
            const overallIdx = 11 < mcells.length ? 11 : Math.max(0, mcells.length - 1);
            const overallCell = mcells[overallIdx];
            if (overallCell && overallCell.v != null) respondents[i].note = String(overallCell.v);
          }
        }
      }
    } catch (e) {
      console.error('Fallback row-index mapping failed:', e);
    }

    // Support pagination via query params: page (1-based) and pageSize
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = Math.max(1, Math.min(500, parseInt(String(req.query.pageSize || '50'), 10) || 50));
    const total = respondents.length;
    const start = (page - 1) * pageSize;
    const end = Math.min(total, start + pageSize);
    const pageItems = respondents.slice(start, end);

    res.status(200).json({ items: pageItems, total, page, pageSize });
  } catch (err) {
    console.error('Failed to fetch respondents:', err);
    res.status(500).json({ error: 'Unable to load respondents' });
  }
};
