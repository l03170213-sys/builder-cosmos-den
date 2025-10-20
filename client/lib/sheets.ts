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

  // Try to fetch the precomputed Matrice Moyennes first
  try {
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
  } catch (e) {
    // Fallback: compute averages from Feuille 1 (sheet1) if Matrice is not available
    try {
      const url1 = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`;
      const r1 = await fetch(url1);
      if (!r1.ok) throw new Error('Unable to fetch sheet1 fallback');
      const text1 = await r1.text();
      const data1 = parseGviz(text1);
      const headers: string[] = (data1.table.cols || []).map((c: any) => (c.label || '').toString());
      const rows1: any[] = (data1.table.rows || []) as any[];

      // Mapping of categories to expected question titles (same grouping used in Apps Script)
      const categoriesDef: Record<string, string[]> = {
        "🌟 APPRÉCIATION GLOBALE": ["Conformité Prestations / Brochures", "Rapport Qualité / Prix", "Appréciation globale des vacances"],
        "✈️ TRANSPORTS Aérien": ["Accueil / Confort", "Ponctualité", "Sécurité"],
        "🚐 Car navette": ["Prestation du conducteur", "Confort et propreté"],
        "🏨 HÉBERGEMENT": ["Accueil", "Cadre des restaurants", "Cadre et environnement", "Propreté des parties communes", "Qualité et variété des plats"],
        "🛏️ CHAMBRES": ["Propreté", "Confort", "Taille", "Salle de bains"],
        "🏊 PISCINE": ["Aménagements", "Hygiène", "Sécurité"],
        "🎉 ANIMATION": ["Qualité des équipements sportifs", "Animation en soirée", "Variété des activités", "Convivialité Équipe d’Animation", "Activités pour enfants", "Animation en journée"],
        "👥 ÉQUIPES": ["Aéroport arrivée", "Aéroport départ", "Réunion d’information", "Présence et convivialité", "Anticipation des besoins", "Réactivité et solutions apportées"],
        "🤝 Représentant Top of Travel": ["Réunion d’information", "Présence et convivialité", "Anticipation des besoins", "Réactivité et solutions apportées"],
        "🌍 EXCURSIONS": ["Qualité", "Moyens de transport", "Guides locaux", "Restauration"]
      };

      const headerMatches = (header: string, title: string) => {
        if (!header || !title) return false;
        const h = header.toString().trim().toLowerCase();
        const t = title.toString().trim().toLowerCase();
        return h === t || h.includes(t) || t.includes(h);
      };

      const categories: { name: string; average: number }[] = [];

      for (const [catName, titles] of Object.entries(categoriesDef)) {
        let sum = 0; let count = 0;
        // find columns matching any title
        const colIndexes: number[] = [];
        for (let hi = 0; hi < headers.length; hi++) {
          const h = headers[hi] || '';
          for (const t of titles) {
            if (headerMatches(h, t)) { colIndexes.push(hi); break; }
          }
        }
        if (colIndexes.length === 0) { continue; }

        // iterate rows and sum numeric values in those columns
        for (let ri = 0; ri < rows1.length; ri++) {
          const cells = (rows1[ri].c || []) as any[];
          for (const ci of colIndexes) {
            const raw = cells[ci] && cells[ci].v != null ? cells[ci].v : null;
            const n = toNumber(raw);
            if (n != null) { sum += n; count++; }
          }
        }

        if (count > 0) {
          const avg = sum / count;
          const normalized = normalizeAverage(avg);
          if (normalized != null) categories.push({ name: catName, average: normalized });
        }
      }

      // compute overallAverage as mean of category averages
      const overallAverage = categories.length ? (categories.reduce((s, c) => s + c.average, 0) / categories.length) : 0;

      return {
        resort: sheetId,
        updatedAt: new Date().toISOString(),
        overallAverage,
        categories,
      };

    } catch (e2) {
      throw new Error('Unable to compute averages from sheet1 fallback: ' + String(e2));
    }
  }
}

export async function fetchRespondentOverallFromMatrice(sheetId: string, gidMatrice?: string, params?: { email?: string; name?: string; date?: string }) {
  const GID = gidMatrice || "0";
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?gid=${GID}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Unable to fetch matrice sheet");
  const text = await r.text();
  const data = parseGviz(text);
  const mrows: any[] = data.table.rows || [];

  const emailKey = (params?.email || "").toString().trim().toLowerCase();
  const nameKey = (params?.name || "").toString().trim().toLowerCase();

  const cellToStr = (cell: any) => {
    if (!cell) return "";
    if (typeof cell === "string") return cell;
    if (typeof cell === "number") return String(cell);
    if (cell && typeof cell === "object" && cell.v != null) return String(cell.v);
    return "";
  };

  for (let ri = 0; ri < mrows.length; ri++) {
    const cells = (mrows[ri].c || []) as any[];
    const normCells = cells.map((c: any) => (cellToStr(c) || "").toString().trim().toLowerCase());

    // priority 1: match name against first cell
    if (nameKey) {
      const firstCell = normCells[0] || "";
      if (firstCell && (firstCell === nameKey || firstCell.includes(nameKey) || nameKey.includes(firstCell))) {
        const overallIdx = 11 < cells.length ? 11 : Math.max(0, cells.length - 1);
        const overallCell = cells[overallIdx];
        if (overallCell && overallCell.v != null) return String(overallCell.v);
      }
    }

    // priority 2: exact email match anywhere
    if (emailKey) {
      for (const txt of normCells) {
        if (!txt) continue;
        if (txt === emailKey) {
          const overallIdx = 11 < cells.length ? 11 : Math.max(0, cells.length - 1);
          const overallCell = cells[overallIdx];
          if (overallCell && overallCell.v != null) return String(overallCell.v);
        }
      }
    }

    // priority 3: partial email or name match
    if (emailKey) {
      for (const txt of normCells) {
        if (!txt) continue;
        if (txt.includes(emailKey) || emailKey.includes(txt)) {
          const overallIdx = 11 < cells.length ? 11 : Math.max(0, cells.length - 1);
          const overallCell = cells[overallIdx];
          if (overallCell && overallCell.v != null) return String(overallCell.v);
        }
      }
    }

    if (nameKey) {
      for (const txt of normCells) {
        if (!txt) continue;
        if (txt.includes(nameKey) || nameKey.includes(txt)) {
          const overallIdx = 11 < cells.length ? 11 : Math.max(0, cells.length - 1);
          const overallCell = cells[overallIdx];
          if (overallCell && overallCell.v != null) return String(overallCell.v);
        }
      }
    }
  }

  // fallback: map by row index using last row overall
  try {
    const lastRow = mrows[mrows.length - 1];
    if (lastRow && lastRow.c) {
      // try to find a column where header matches email/name? skip - return null
    }
  } catch (e) {
    // ignore
  }
  return null;
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
