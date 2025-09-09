import type { RequestHandler } from "express";
import type { ResortAveragesResponse } from "@shared/api";
import { RESORTS } from "../resorts";

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

export const getResortAverages: RequestHandler = async (req, res) => {
  try {
    const resortKey = req.params.resort as string;
    const cfg = RESORTS[resortKey];
    if (!cfg) return res.status(404).json({ error: 'Unknown resort' });

    const SHEET_ID = cfg.sheetId;
    const GID_MATRICE_MOYENNE = cfg.gidMatrice ?? '0';

    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID_MATRICE_MOYENNE}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: 'Unable to fetch matrice' });
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

    // Use fixed category mapping (columns A-L => indices 0-11), categories start at index 1
    const fixedCategoryMapping = [
      { colIndex: 0, name: 'Nom' },
      { colIndex: 1, name: '🌟 APPRÉCIATION GLOBALE' },
      { colIndex: 2, name: '✈️ TRANSPORTS Aérien' },
      { colIndex: 3, name: '🚐 Car navette' },
      { colIndex: 4, name: '🏨 HÉBERGEMENT' },
      { colIndex: 5, name: '🛏️ CHAMBRES' },
      { colIndex: 6, name: '🏊 PISCINE' },
      { colIndex: 7, name: '🎉 ANIMATION' },
      { colIndex: 8, name: '👥 ÉQUIPES' },
      { colIndex: 9, name: '🤝 Représentant Top of Travel' },
      { colIndex: 10, name: '🌍 EXCURSIONS' },
      { colIndex: 11, name: 'MOYENNE GÉNÉRALE' },
    ];

    const categories = [] as { name: string; average: number }[];

    const isPestana = resortKey === 'pestana-royal-ocean-madeira';

    if (isPestana) {
      // For Pestana, strictly use columns 1..10 as categories and column 11 (L) as overall (from the last non-empty row)
      for (let idx = 1; idx <= 10; idx++) {
        const name = fixedCategoryMapping.find(m => m.colIndex === idx)?.name || `Col ${idx}`;
        const val = toNumber(cells[idx]?.v);
        if (val != null) categories.push({ name, average: val });
      }
      // overall from column L (index 11) of lastRow, or fallback to last cell
      const overallIdx = 11;
      const overallCell = (lastRow && lastRow.c && lastRow.c[overallIdx]) ? lastRow.c[overallIdx] : (cells.length ? cells[cells.length - 1] : null);
      const overallAverage = toNumber(overallCell?.v) ?? 0;

      const response: ResortAveragesResponse = {
        resort: cfg.name,
        updatedAt: new Date().toISOString(),
        overallAverage,
        categories,
      };

      return res.status(200).json(response);
    }

    // Default behavior for other resorts
    // Build categories from fixed mapping, skipping 'Nom' and 'MOYENNE GÉNÉRALE' for category list
    for (const m of fixedCategoryMapping) {
      if (m.colIndex === 0) continue; // skip name
      if (m.colIndex === 11) continue; // skip overall in category list
      const val = toNumber(cells[m.colIndex]?.v);
      if (val != null) categories.push({ name: m.name, average: val });
    }

    // Determine overallAverage from fixed column L (index 11) if present, otherwise fall back to last column
    const overallIdx = Math.min(11, Math.max(0, cells.length - 1));
    const overallCell = cells[overallIdx];
    const overallAverage = toNumber(overallCell?.v) ?? 0;

    const response: ResortAveragesResponse = {
      resort: cfg.name,
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
