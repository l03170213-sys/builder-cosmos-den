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
  if (typeof val === "number")
    return Number.isFinite(val) ? (val as number) : null;
  if (typeof val === "string") {
    // extract first numeric token like 4,42 or 4.42 or 45%
    const m = (val as string).replace("\u00A0", "").match(/-?\d+[.,]?\d*/);
    if (!m) return null;
    const n = Number(m[0].replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  // Sometimes Google returns objects like {v: '4,42', f: '4,42'} as cell value
  if (typeof val === "object" && val !== null) {
    const anyVal: any = val;
    if (anyVal.v != null) return toNumber(anyVal.v);
    if (anyVal.f != null) return toNumber(anyVal.f);
  }
  return null;
}

function normalizeAverage(n: number | null): number | null {
  if (n == null) return null;
  // valid survey scores are between 0 and 5; anything outside is likely parsing error
  if (n < 0 || n > 5) return null;
  return n;
}

export const getResortAverages: RequestHandler = async (req, res) => {
  try {
    const resortKey = req.params.resort as string;
    const cfg = RESORTS[resortKey];
    if (!cfg) return res.status(404).json({ error: "Unknown resort" });

    const SHEET_ID = cfg.sheetId;
    const GID_MATRICE_MOYENNE = cfg.gidMatrice ?? "0";
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID_MATRICE_MOYENNE}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: "Unable to fetch matrice" });

    const text = await r.text();
    const data = parseGviz(text);

    const rows: any[] = data.table.rows as any[];

    // last non-empty row
    let lastRow = rows[rows.length - 1];
    for (let i = rows.length - 1; i >= 0; i--) {
      const rr = rows[i];
      const hasValue = (rr?.c ?? []).some((cell: any) => cell && cell.v != null && cell.v !== "");
      if (hasValue) { lastRow = rr; break; }
    }

    const cells = (lastRow?.c ?? []) as any[];

    const fixedCategoryMapping = [
      { colIndex: 0, name: "Nom" },
      { colIndex: 1, name: "🌟 APPRÉCIATION GLOBALE" },
      { colIndex: 2, name: "✈️ TRANSPORTS Aérien" },
      { colIndex: 3, name: "🚐 Car navette" },
      { colIndex: 4, name: "🏨 HÉBERGEMENT" },
      { colIndex: 5, name: "🛏️ CHAMBRES" },
      { colIndex: 6, name: "🏊 PISCINE" },
      { colIndex: 7, name: "🎉 ANIMATION" },
      { colIndex: 8, name: "👥 ÉQUIPES" },
      { colIndex: 9, name: "🤝 Représentant Top of Travel" },
      { colIndex: 10, name: "🌍 EXCURSIONS" },
      { colIndex: 11, name: "MOYENNE GÉNÉRALE" },
    ];

    const categories: { name: string; average: number }[] = [];

    const isPestana = resortKey === "pestana-royal-ocean-madeira";

    if (isPestana) {
      // inclure systématiquement les colonnes 1..10
      for (let idx = 1; idx <= 10; idx++) {
        const name = fixedCategoryMapping[idx]?.name ?? `Col ${idx}`;
        const raw = toNumber(cells[idx]?.v);
        const val = normalizeAverage(raw);
        categories.push({ name, average: val ?? 0 }); // garde 0 si vide
      }
    } else {
      // comportement par défaut
      for (const m of fixedCategoryMapping) {
        if (m.colIndex === 0 || m.colIndex === 11) continue;
        const raw = toNumber(cells[m.colIndex]?.v);
        const val = normalizeAverage(raw);
        if (val != null) categories.push({ name: m.name, average: val });
      }
    }

    // overall from column L (index 11) if available, otherwise fallback to last cell
    const overallIdx = 11 < cells.length ? 11 : Math.max(0, cells.length - 1);
    const overallAverage = normalizeAverage(toNumber(cells[overallIdx]?.v)) ?? 0;

    const response: ResortAveragesResponse = {
      resort: cfg.name,
      updatedAt: new Date().toISOString(),
      overallAverage,
      categories,
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error("Failed to fetch sheet:", err);
    return res.status(500).json({ error: "Unable to load Google Sheet data" });
  }
};
