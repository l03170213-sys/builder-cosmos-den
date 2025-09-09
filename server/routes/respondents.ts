import type { RequestHandler } from "express";
import { RESORTS } from "../resorts";

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
    const json = (function parseGviz(text: string){ const start = text.indexOf('('); const end = text.lastIndexOf(')'); const json = text.slice(start + 1, end); return JSON.parse(json); })(text);
    const cols: string[] = (json.table.cols || []).map((c: any) => (c.label || '').toString());
    const rows: any[] = (json.table.rows || []) as any[];

    const respondents: { id: number; label: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const c = r.c || [];
      const first = c[0] && c[0].v != null ? String(c[0].v) : '';
      if (!first) continue;
      respondents.push({ id: i + 1, label: first });
    }

    res.status(200).json({ respondents });
  } catch (err) {
    console.error('Failed to fetch respondents:', err);
    res.status(500).json({ error: 'Unable to load respondents' });
  }
};
