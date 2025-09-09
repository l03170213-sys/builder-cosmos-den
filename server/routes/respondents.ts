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

    const emailCol = findCol(['email', 'courriel', '@']);
    const noteCol = findCol(['note', 'moyenne', 'overall', 'note général', 'note generale', 'note générale']);
    const dateCol = findCol(['date']);
    const ageCol = findCol(['age']);
    const postalCol = findCol(['postal', 'code postal', 'postcode', 'zip']);
    const durationCol = findCol(['durée', 'duree', 'duration', 'séjour', 'sejour']);
    const feedbackCol = findCol(['comment', 'commentaire', 'feedback', 'remarque']);

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
      obj.label = cellToString(c[0]);
      obj.email = emailCol !== -1 ? cellToString(c[emailCol]) : '';
      obj.note = resolvedNoteCol !== -1 ? cellToString(c[resolvedNoteCol]) : '';
      obj.date = dateCol !== -1 ? cellToString(c[dateCol]) : '';
      obj.age = ageCol !== -1 ? cellToString(c[ageCol]) : '';
      obj.postal = postalCol !== -1 ? cellToString(c[postalCol]) : '';
      obj.duration = durationCol !== -1 ? cellToString(c[durationCol]) : '';
      obj.feedback = feedbackCol !== -1 ? cellToString(c[feedbackCol]) : '';

      // If email empty, try to infer from label
      if (!obj.email && obj.label && obj.label.includes('@')) obj.email = obj.label;

      respondents.push(obj);
    }

    res.status(200).json(respondents);
  } catch (err) {
    console.error('Failed to fetch respondents:', err);
    res.status(500).json({ error: 'Unable to load respondents' });
  }
};
