import type { RequestHandler } from "express";
import type { ResortAveragesResponse } from "@shared/api";

const SHEET_ID = "1jO4REgqWiXeh3U9e2uueRoLsviB0o64Li5d39Fp38os";
const GID_MATRICE_MOYENNE = "1595451985";

function parseGviz(text: string) {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  const json = text.slice(start + 1, end);
  return JSON.parse(json);
}

function toNumber(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return val;
  if (typeof val === "string") {
    const n = Number(val.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export const getResortAverages: RequestHandler = async (_req, res) => {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID_MATRICE_MOYENNE}`;
    const r = await fetch(url);
    const text = await r.text();
    const data = parseGviz(text);

    const cols: string[] = data.table.cols.map((c: any) => c.label || "");
    const rows: any[] = data.table.rows as any[];

    // Find last non-empty row
    let lastRow = rows[rows.length - 1];
    for (let i = rows.length - 1; i >= 0; i--) {
      const rr = rows[i];
      const hasValue = (rr?.c ?? []).some((cell: any) => cell && cell.v != null && cell.v !== "");
      if (hasValue) {
        lastRow = rr;
        break;
      }
    }

    const cells = (lastRow?.c ?? []) as any[];

    // Build response: ignore first column (person name) and last column (overall average)
    const firstDataCol = 1;
    const lastDataCol = cols.length - 2; // exclusive of last (overall)

    const categories = [] as { name: string; average: number }[];
    for (let i = firstDataCol; i <= lastDataCol; i++) {
      const label = cols[i] || `Col ${i}`;
      const val = toNumber(cells[i]?.v);
      if (val != null) {
        categories.push({ name: label, average: val });
      }
    }

    const overallCell = cells[cols.length - 1];
    const overallAverage = toNumber(overallCell?.v) ?? 0;

    const response: ResortAveragesResponse = {
      resort: "VM Resort Albanie",
      updatedAt: new Date().toISOString(),
      overallAverage,
      categories,
    };

    res.status(200).json(response);
  } catch (err) {
    console.error("Failed to fetch sheet:", err);
    res.status(500).json({ error: "Unable to load Google Sheet data" });
  }
};
