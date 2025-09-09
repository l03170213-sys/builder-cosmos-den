import type { RequestHandler } from "express";
import type { ResortSummaryResponse } from "@shared/api";
import { RESORTS } from "../resorts";

function parseGviz(text: string) {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  const json = text.slice(start + 1, end);
  return JSON.parse(json);
}

function valueToString(v: any) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && v.v != null) return String(v.v).trim();
  return String(v);
}

export const getResortSummary: RequestHandler = async (req, res) => {
  try {
    const resortKey = req.params.resort as string;
    const cfg = RESORTS[resortKey];
    if (!cfg) return res.status(404).json({ error: 'Unknown resort' });

    const SHEET_ID = cfg.sheetId;

    // Fetch first sheet (default gid=0)
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: 'Unable to fetch summary' });
    const text = await r.text();
    const data = parseGviz(text);

    const cols: string[] = (data.table.cols || []).map((c: any) => (c.label || "").toString());
    const rows: any[] = (data.table.rows || []) as any[];

    // Count valid respondent rows (any non-empty cell)
    let respondents = 0;
    for (const row of rows) {
      const cells = row.c || [];
      const hasValue = cells.some((cell: any) => cell && cell.v != null && String(cell.v).toString().trim() !== "");
      if (hasValue) respondents++;
    }

    // Find recommendation-like column index
    let recCol = -1;
    for (let i = 0; i < cols.length; i++) {
      const label = (cols[i] || "").toLowerCase();
      if (label.includes("recommand") || label.includes("recommend") || label.includes("recommandation")) {
        recCol = i;
        break;
      }
    }

    let recommendationRate: number | null = null;
    if (recCol !== -1) {
      let yes = 0;
      let valid = 0;
      for (const row of rows) {
        const cells = row.c || [];
        const raw = valueToString(cells[recCol]);
        if (!raw) continue;
        valid++;
        const v = raw.trim().toLowerCase();
        if (v === "oui" || v === "o" || v === "yes") yes++;
      }
      if (valid > 0) recommendationRate = yes / valid;
    }

    const response: ResortSummaryResponse = {
      resort: cfg.name,
      respondents,
      recommendationRate,
    };

    res.status(200).json(response);
  } catch (err) {
    console.error("Failed to fetch sheet summary:", err);
    res.status(500).json({ error: "Unable to load Google Sheet summary" });
  }
};
