// Client-side helpers to fetch and parse Google Sheets GViz responses

function parseGviz(text: string) {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  const json = text.slice(start + 1, end);
  return JSON.parse(json);
}

function toNumber(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return Number.isFinite(val) ? (val as number) : null;
  if (typeof val === "string") {
    const m = (val as string).replace("\u00A0", "").match(/-?\d+[.,]?\d*/);
    if (!m) return null;
    const n = Number(m[0].replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof val === "object" && val !== null) {
    const anyVal: any = val;
    if (anyVal.v != null) return toNumber(anyVal.v);
    if (anyVal.f != null) return toNumber(anyVal.f);
  }
  return null;
}

function normalizeAverage(n: number | null): number | null {
  if (n == null) return null;
  if (n < 0 || n > 5) return null;
  return n;
}

export async function fetchAveragesFromSheet(sheetId: string, gidMatrice?: string) {
  const GID = gidMatrice || "0";
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?gid=${GID}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Unable to fetch matrice sheet");
  const text = await r.text();
  const data = parseGviz(text);
  const rows: any[] = data.table.rows as any[];

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
  for (const m of fixedCategoryMapping) {
    if (m.colIndex === 0 || m.colIndex === 11) continue;
    const raw = toNumber(cells[m.colIndex]?.v);
    const val = normalizeAverage(raw);
    if (val != null) categories.push({ name: m.name, average: val });
  }

  const overallIdx = 11 < cells.length ? 11 : Math.max(0, cells.length - 1);
  const overallAverage = normalizeAverage(toNumber(cells[overallIdx]?.v)) ?? 0;

  return {
    resort: sheetId,
    updatedAt: new Date().toISOString(),
    overallAverage,
    categories,
  };
}

export async function fetchSummaryFromSheet(sheetId: string) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Unable to fetch summary sheet");
  const text = await r.text();
  const data = parseGviz(text);
  const cols: string[] = (data.table.cols || []).map((c: any) => (c.label || "").toString());
  const rows: any[] = (data.table.rows || []) as any[];

  let respondents = 0;
  for (const row of rows) {
    const cells = row.c || [];
    const hasValue = cells.some((cell: any) => cell && cell.v != null && String(cell.v).toString().trim() !== "");
    if (hasValue) respondents++;
  }

  let recCol = -1;
  for (let i = 0; i < cols.length; i++) {
    const label = (cols[i] || "").toLowerCase();
    if (label.includes("recommand") || label.includes("recommend") || label.includes("recommandation")) {
      recCol = i; break;
    }
  }

  let recommendationRate: number | null = null;
  if (recCol !== -1) {
    let yes = 0; let valid = 0;
    for (const row of rows) {
      const cells = row.c || [];
      const raw = (cells[recCol] && (cells[recCol].v != null ? String(cells[recCol].v) : "")) || "";
      if (!raw) continue;
      valid++;
      const v = raw.trim().toLowerCase();
      if (v === "oui" || v === "o" || v === "yes") yes++;
    }
    if (valid > 0) recommendationRate = yes / valid;
  }

  return { resort: sheetId, respondents, recommendationRate };
}
