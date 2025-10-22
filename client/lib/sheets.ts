// Client-side helpers to fetch and parse Google Sheets GViz responses

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

export async function fetchAveragesFromSheet(
  sheetId: string,
  gidMatrice?: string,
) {
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
      const hasValue = (rr?.c ?? []).some(
        (cell: any) => cell && cell.v != null && cell.v !== "",
      );
      if (hasValue) {
        lastRow = rr;
        break;
      }
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
    const overallAverage =
      normalizeAverage(toNumber(cells[overallIdx]?.v)) ?? 0;

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
      if (!r1.ok) throw new Error("Unable to fetch sheet1 fallback");
      const text1 = await r1.text();
      const data1 = parseGviz(text1);
      const headers: string[] = (data1.table.cols || []).map((c: any) =>
        (c.label || "").toString(),
      );
      const rows1: any[] = (data1.table.rows || []) as any[];

      // Mapping of categories to expected question titles (same grouping used in Apps Script)
      const categoriesDef: Record<string, string[]> = {
        "🌟 APPRÉCIATION GLOBALE": [
          "Conformité Prestations / Brochures",
          "Rapport Qualité / Prix",
          "Appréciation globale des vacances",
        ],
        "✈️ TRANSPORTS Aérien": [
          "Accueil / Confort",
          "Ponctualité",
          "Sécurité",
        ],
        "🚐 Car navette": ["Prestation du conducteur", "Confort et propreté"],
        "🏨 HÉBERGEMENT": [
          "Accueil",
          "Cadre des restaurants",
          "Cadre et environnement",
          "Propreté des parties communes",
          "Qualité et variété des plats",
        ],
        "🛏️ CHAMBRES": ["Propreté", "Confort", "Taille", "Salle de bains"],
        "🏊 PISCINE": ["Aménagements", "Hygiène", "Sécurité"],
        "🎉 ANIMATION": [
          "Qualité des équipements sportifs",
          "Animation en soirée",
          "Variété des activités",
          "Convivialité Équipe d’Animation",
          "Activités pour enfants",
          "Animation en journée",
        ],
        "👥 ÉQUIPES": [
          "Aéroport arrivée",
          "Aéroport départ",
          "Réunion d’information",
          "Présence et convivialité",
          "Anticipation des besoins",
          "Réactivité et solutions apportées",
        ],
        "🤝 Représentant Top of Travel": [
          "Réunion d’information",
          "Présence et convivialité",
          "Anticipation des besoins",
          "Réactivité et solutions apportées",
        ],
        "🌍 EXCURSIONS": [
          "Qualité",
          "Moyens de transport",
          "Guides locaux",
          "Restauration",
        ],
      };

      const headerMatches = (header: string, title: string) => {
        if (!header || !title) return false;
        const h = header.toString().trim().toLowerCase();
        const t = title.toString().trim().toLowerCase();
        return h === t || h.includes(t) || t.includes(h);
      };

      const categories: { name: string; average: number }[] = [];

      for (const [catName, titles] of Object.entries(categoriesDef)) {
        let sum = 0;
        let count = 0;
        // find columns matching any title
        const colIndexes: number[] = [];
        for (let hi = 0; hi < headers.length; hi++) {
          const h = headers[hi] || "";
          for (const t of titles) {
            if (headerMatches(h, t)) {
              colIndexes.push(hi);
              break;
            }
          }
        }
        if (colIndexes.length === 0) {
          continue;
        }

        // iterate rows and sum numeric values in those columns
        for (let ri = 0; ri < rows1.length; ri++) {
          const cells = (rows1[ri].c || []) as any[];
          for (const ci of colIndexes) {
            const raw = cells[ci] && cells[ci].v != null ? cells[ci].v : null;
            const n = toNumber(raw);
            if (n != null) {
              sum += n;
              count++;
            }
          }
        }

        if (count > 0) {
          const avg = sum / count;
          const normalized = normalizeAverage(avg);
          if (normalized != null)
            categories.push({ name: catName, average: normalized });
        }
      }

      // compute overallAverage as mean of category averages
      const overallAverage = categories.length
        ? categories.reduce((s, c) => s + c.average, 0) / categories.length
        : 0;

      return {
        resort: sheetId,
        updatedAt: new Date().toISOString(),
        overallAverage,
        categories,
      };
    } catch (e2) {
      throw new Error(
        "Unable to compute averages from sheet1 fallback: " + String(e2),
      );
    }
  }
}

export async function fetchRespondentOverallFromMatrice(
  sheetId: string,
  gidMatrice?: string,
  params?: { email?: string; name?: string; date?: string },
) {
  const res = await fetchRespondentDetailsFromSheet(
    sheetId,
    gidMatrice,
    params,
  );
  return res ? (res.overall ?? res.overallAverage ?? null) : null;
}

export async function fetchRespondentDetailsFromSheet(
  sheetId: string,
  gidMatrice?: string,
  params?: { email?: string; name?: string; date?: string },
) {
  // Attempt to fetch matrice and return detailed categories/overall/feedback similar to server logic
  const GID = gidMatrice || "0";
  const mgurl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?gid=${GID}`;
  try {
    const mr = await fetch(mgurl);
    if (!mr.ok) throw new Error("Unable to fetch matrice");
    const mtext = await mr.text();
    const mjson = parseGviz(mtext);
    const mcols: string[] = (mjson.table.cols || []).map((c: any) =>
      (c.label || "").toString(),
    );
    const mrows: any[] = mjson.table.rows || [];

    // helper
    const cellToStringLocal = (cell: any) => {
      if (!cell) return "";
      if (typeof cell === "string") return cell;
      if (typeof cell === "number") return String(cell);
      if (cell && typeof cell === "object" && cell.v != null)
        return String(cell.v);
      return "";
    };

    const emailKey = (params?.email || "").toString().trim().toLowerCase();
    const nameKey = (params?.name || "").toString().trim().toLowerCase();

    const normalize = (s: string) => (s || "").toString().trim().toLowerCase();
    const normalizeDiacritics = (s: string) => {
      try {
        return s
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      } catch (e) {
        return s.toString().trim().toLowerCase();
      }
    };

    // Try columns-as-respondents first
    const headerIndexMap: Record<string, number> = {};
    for (let ci = 0; ci < mcols.length; ci++) {
      const key = normalizeDiacritics((mcols[ci] || "").toString()).replace(
        /[^a-z0-9@]+/g,
        "",
      );
      if (key) headerIndexMap[key] = ci;
    }
    let respColIndex = -1;
    const targetNameNorm = normalizeDiacritics(nameKey).replace(/\s+/g, "");
    const targetEmailHeader = emailKey;
    for (const lblKey of Object.keys(headerIndexMap)) {
      if (targetEmailHeader && lblKey.includes(targetEmailHeader)) {
        respColIndex = headerIndexMap[lblKey];
        break;
      }
      if (targetNameNorm && lblKey.includes(targetNameNorm)) {
        respColIndex = headerIndexMap[lblKey];
        break;
      }
    }

    // token matching
    if (respColIndex === -1 && mcols && mcols.length) {
      const nameTokens = (nameKey || "")
        .split(/\s+/)
        .map((t) => normalizeDiacritics(t).replace(/[^a-z0-9]+/g, ""))
        .filter(Boolean);
      for (let ci = 0; ci < mcols.length; ci++) {
        const lbl = normalizeDiacritics(mcols[ci] || "").replace(
          /[^a-z0-9]+/g,
          "",
        );
        if (!lbl) continue;
        if (targetEmailHeader && lbl.includes(targetEmailHeader)) {
          respColIndex = ci;
          break;
        }
        let matchCount = 0;
        for (const tk of nameTokens) if (lbl.includes(tk)) matchCount++;
        if (
          nameTokens.length > 0 &&
          matchCount >= Math.max(1, Math.floor(nameTokens.length / 2))
        ) {
          respColIndex = ci;
          break;
        }
      }
    }

    const parseRatingCell = (cell: any) => {
      const s = cellToStringLocal(cell);
      const m = s && s.match && s.match(/-?\d+[.,]?\d*/g);
      if (m && m.length) {
        const n = Number(String(m[0]).replace(",", "."));
        if (Number.isFinite(n) && n >= 0 && n <= 5)
          return String(Number(n.toFixed(2)));
      }
      return s || "";
    };

    const fixedCategoryMapping = [
      { colIndex: 0, name: "Nom" },
      { colIndex: 1, name: "🌟 APPRÉCIATION GLOBALE" },
      { colIndex: 2, name: "✈️ TRANSPORTS Aérien" },
      { colIndex: 3, name: "🚐 Car navette" },
      { colIndex: 4, name: "🏨 HÉBERGEMENT" },
      { colIndex: 5, name: "🛏️ CHAMBRES" },
      { colIndex: 6, name: "🏊 PISCINE" },
      { colIndex: 7, name: "🎉 ANIMATION" },
      { colIndex: 8, name: "�� ÉQUIPES" },
      { colIndex: 9, name: "🤝 Représentant Top of Travel" },
      { colIndex: 10, name: "🌍 EXCURSIONS" },
      { colIndex: 11, name: "MOYENNE GÉNÉRALE" },
    ];

    if (respColIndex !== -1) {
      const newCats: any[] = [];
      for (let i = 1; i <= 10; i++) {
        const foundRow = i - 1 < mrows.length ? mrows[i - 1] : null;
        const catNameFromRow =
          foundRow && foundRow.c && foundRow.c[0]
            ? cellToStringLocal(foundRow.c[0])
            : "";
        const catName =
          catNameFromRow ||
          (mcols && mcols[i]
            ? mcols[i]
            : fixedCategoryMapping.find((f) => f.colIndex === i)?.name ||
              `Col ${i}`);
        let val = "";
        if (foundRow && foundRow.c) {
          const cell = foundRow.c[respColIndex];
          if (cell && cell.v != null) val = parseRatingCell(cell);
        }
        newCats.push({ name: catName, value: val });
      }
      // overall search
      let overallVal: null | string = null;
      for (let ri = 0; ri < mrows.length; ri++) {
        const first =
          mrows[ri] && mrows[ri].c && mrows[ri].c[0]
            ? cellToStringLocal(mrows[ri].c[0])
            : "";
        if (first && normalize(first).includes("moyenne")) {
          const c = mrows[ri].c && mrows[ri].c[respColIndex];
          if (c && c.v != null) overallVal = parseRatingCell(c);
          break;
        }
      }
      if (!overallVal) {
        for (let ri = mrows.length - 1; ri >= 0; ri--) {
          const c = mrows[ri] && mrows[ri].c && mrows[ri].c[respColIndex];
          if (c && c.v != null) {
            overallVal = parseRatingCell(c);
            break;
          }
        }
      }
      return {
        categories: [{ name: "Nom", value: "" }, ...newCats],
        overall: overallVal,
        column: String(respColIndex),
      };
    }

    // rows-as-respondents: try find row matching name/email
    const targetName = nameKey.toString().trim().toLowerCase();
    const targetEmailRow = emailKey.toString().trim().toLowerCase();
    let matchedRowIdx = -1;
    for (let ri = 0; ri < mrows.length; ri++) {
      const cells = mrows[ri].c || [];
      const norm = cells.map((c: any) =>
        normalizeDiacritics(cellToStringLocal(c) || "").replace(/\s+/g, ""),
      );
      if (targetEmailRow && norm.some((v: any) => v && v.includes(targetEmailRow))) {
        matchedRowIdx = ri;
        break;
      }
      const targetNameD = normalizeDiacritics(targetName).replace(/\s+/g, "");
      if (
        targetName &&
        norm.some(
          (v: any) => v && (v.includes(targetNameD) || targetNameD.includes(v)),
        )
      ) {
        matchedRowIdx = ri;
        break;
      }
    }
    if (matchedRowIdx !== -1) {
      const mrow = mrows[matchedRowIdx];
      const newCats: any[] = [];
      const maxCols = Math.max(10, mcols.length - 1);
      for (let ci = 1; ci <= Math.min(maxCols, 20); ci++) {
        const headerName =
          mcols && mcols[ci]
            ? String(mcols[ci])
            : fixedCategoryMapping.find((f) => f.colIndex === ci)?.name ||
              `Col ${ci}`;
        let val = "";
        if (mrow && mrow.c && mrow.c[ci] && mrow.c[ci].v != null)
          val = parseRatingCell(mrow.c[ci]);
        newCats.push({ name: headerName, value: val });
      }
      const overallCell = mrow && mrow.c && mrow.c[11] ? mrow.c[11] : null;
      const overall =
        overallCell && overallCell.v != null
          ? parseRatingCell(overallCell)
          : null;
      return {
        categories: [{ name: "Nom", value: "" }, ...newCats],
        overall,
        column: null,
      };
    }

    // If no per-respondent data found in matrice, try to compute from sheet1 row if present
    try {
      const sUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`;
      const sr = await fetch(sUrl);
      if (!sr.ok) throw new Error("Unable to fetch sheet1 for fallback");
      const stext = await sr.text();
      const sjson = parseGviz(stext);
      const scols: string[] = (sjson.table.cols || []).map((c: any) =>
        (c.label || "").toString(),
      );
      const srows: any[] = sjson.table.rows || [];
      // find respondent row in sheet1
      for (let ri = 0; ri < srows.length; ri++) {
        const cells = srows[ri].c || [];
        const normCells = cells.map((c: any) =>
          (cellToStringLocal(c) || "").toString().trim().toLowerCase(),
        );
        if (
          targetEmail &&
          normCells.some((v: any) => v && v.includes(targetEmail))
        ) {
          matchedRowIdx = ri;
          break;
        }
        if (
          targetName &&
          normCells.some(
            (v: any) => v && v.includes(normalizeDiacritics(targetName)),
          )
        ) {
          matchedRowIdx = ri;
          break;
        }
      }
      if (matchedRowIdx !== -1) {
        const scells = srows[matchedRowIdx].c || [];
        // compute per-category averages from sheet1 for this row using same categoriesDef as above
        const categoriesDef: Record<string, string[]> = {
          "🌟 APPRÉCIATION GLOBALE": [
            "Conformité Prestations / Brochures",
            "Rapport Qualité / Prix",
            "Appréciation globale des vacances",
          ],
          "✈️ TRANSPORTS Aérien": [
            "Accueil / Confort",
            "Ponctualité",
            "Sécurité",
          ],
          "🚐 Car navette": ["Prestation du conducteur", "Confort et propreté"],
          "🏨 HÉBERGEMENT": [
            "Accueil",
            "Cadre des restaurants",
            "Cadre et environnement",
            "Propreté des parties communes",
            "Qualité et variété des plats",
          ],
          "🛏️ CHAMBRES": ["Propreté", "Confort", "Taille", "Salle de bains"],
          "🏊 PISCINE": ["Aménagements", "Hygiène", "Sécurité"],
          "🎉 ANIMATION": [
            "Qualité des équipements sportifs",
            "Animation en soirée",
            "Variété des activités",
            "Convivialité Équipe d’Animation",
            "Activités pour enfants",
            "Animation en journée",
          ],
          "👥 ÉQUIPES": [
            "Aéroport arrivée",
            "Aéroport départ",
            "Réunion d’information",
            "Présence et convivialité",
            "Anticipation des besoins",
            "Réactivité et solutions apportées",
          ],
          "🤝 Représentant Top of Travel": [
            "Réunion d’information",
            "Présence et convivialité",
            "Anticipation des besoins",
            "Réactivité et solutions apportées",
          ],
          "🌍 EXCURSIONS": [
            "Qualité",
            "Moyens de transport",
            "Guides locaux",
            "Restauration",
          ],
        };
        const newCats: any[] = [];
        for (const [catName, titles] of Object.entries(categoriesDef)) {
          const colIndexes: number[] = [];
          for (let hi = 0; hi < scols.length; hi++) {
            const h = scols[hi] || "";
            for (const t of titles) {
              if (
                h &&
                typeof h === "string" &&
                h.toString().trim().toLowerCase().includes(t.toLowerCase())
              ) {
                colIndexes.push(hi);
                break;
              }
            }
          }
          if (colIndexes.length === 0) {
            newCats.push({ name: catName, value: "" });
            continue;
          }
          // for this respondent row, average available numeric values
          let sum = 0,
            count = 0;
          for (const ci of colIndexes) {
            const raw =
              scells[ci] && scells[ci].v != null ? scells[ci].v : null;
            const n = toNumber(raw);
            if (n != null) {
              sum += n;
              count++;
            }
          }
          if (count > 0) {
            const avg = sum / count;
            const norm = normalizeAverage(avg);
            newCats.push({
              name: catName,
              value: norm != null ? String(Number(norm.toFixed(2))) : "",
            });
          } else {
            newCats.push({ name: catName, value: "" });
          }
        }
        // overall from sheet1 if present
        const overall =
          scells[11] && scells[11].v != null ? String(scells[11].v) : null;
        return {
          categories: [{ name: "Nom", value: "" }, ...newCats],
          overall,
          column: null,
        };
      }
    } catch (e) {
      // ignore
    }

    // if all fails, return null
    return null;
  } catch (err) {
    // unable to fetch matrice - try to compute from sheet1 general averages
    try {
      const sres = await fetch(
        `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`,
      );
      if (!sres.ok) return null;
      const st = await sres.text();
      const sj = parseGviz(st);
      const headers = (sj.table.cols || []).map((c: any) =>
        (c.label || "").toString(),
      );
      const rows = (sj.table.rows || []) as any[];
      // compute overall categories averages as in fetchAveragesFromSheet fallback
      const categoriesDef: Record<string, string[]> = {
        "🌟 APPRÉCIATION GLOBALE": [
          "Conformité Prestations / Brochures",
          "Rapport Qualité / Prix",
          "Appréciation globale des vacances",
        ],
        "✈️ TRANSPORTS Aérien": [
          "Accueil / Confort",
          "Ponctualité",
          "Sécurité",
        ],
        "🚐 Car navette": ["Prestation du conducteur", "Confort et propreté"],
        "🏨 HÉBERGEMENT": [
          "Accueil",
          "Cadre des restaurants",
          "Cadre et environnement",
          "Propreté des parties communes",
          "Qualité et variété des plats",
        ],
        "🛏️ CHAMBRES": ["Propreté", "Confort", "Taille", "Salle de bains"],
        "🏊 PISCINE": ["Aménagements", "Hygiène", "Sécurité"],
        "🎉 ANIMATION": [
          "Qualité des équipements sportifs",
          "Animation en soirée",
          "Variété des activités",
          "Convivialité Équipe d’Animation",
          "Activités pour enfants",
          "Animation en journée",
        ],
        "👥 ÉQUIPES": [
          "Aéroport arrivée",
          "Aéroport départ",
          "Réunion d’information",
          "Présence et convivialité",
          "Anticipation des besoins",
          "Réactivité et solutions apportées",
        ],
        "🤝 Représentant Top of Travel": [
          "Réunion d’information",
          "Présence et convivialité",
          "Anticipation des besoins",
          "Réactivité et solutions apportées",
        ],
        "🌍 EXCURSIONS": [
          "Qualité",
          "Moyens de transport",
          "Guides locaux",
          "Restauration",
        ],
      };
      const cats: any[] = [];
      for (const [catName, titles] of Object.entries(categoriesDef)) {
        const colIndexes: number[] = [];
        for (let hi = 0; hi < headers.length; hi++) {
          const h = headers[hi] || "";
          for (const t of titles) {
            if (
              h &&
              typeof h === "string" &&
              h.toString().trim().toLowerCase().includes(t.toLowerCase())
            ) {
              colIndexes.push(hi);
              break;
            }
          }
        }
        if (colIndexes.length === 0) continue;
        let sum = 0,
          count = 0;
        for (let ri = 0; ri < rows.length; ri++) {
          const cells = rows[ri].c || [];
          for (const ci of colIndexes) {
            const raw = cells[ci] && cells[ci].v != null ? cells[ci].v : null;
            const n = toNumber(raw);
            if (n != null) {
              sum += n;
              count++;
            }
          }
        }
        if (count > 0) {
          const avg = sum / count;
          const norm = normalizeAverage(avg);
          if (norm != null) cats.push({ name: catName, average: norm });
        }
      }
      const overallAverage = cats.length
        ? cats.reduce((s: any, c: any) => s + c.average, 0) / cats.length
        : 0;
      return { categories: cats, overall: overallAverage } as any;
    } catch (e2) {
      return null;
    }
  }
}

export async function fetchSummaryFromSheet(sheetId: string) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("Unable to fetch summary sheet");
  const text = await r.text();
  const data = parseGviz(text);
  const cols: string[] = (data.table.cols || []).map((c: any) =>
    (c.label || "").toString(),
  );
  const rows: any[] = (data.table.rows || []) as any[];

  let respondents = 0;
  for (const row of rows) {
    const cells = row.c || [];
    const hasValue = cells.some(
      (cell: any) =>
        cell && cell.v != null && String(cell.v).toString().trim() !== "",
    );
    if (hasValue) respondents++;
  }

  let recCol = -1;
  for (let i = 0; i < cols.length; i++) {
    const label = (cols[i] || "").toLowerCase();
    if (
      label.includes("recommand") ||
      label.includes("recommend") ||
      label.includes("recommandation")
    ) {
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
      const raw =
        (cells[recCol] &&
          (cells[recCol].v != null ? String(cells[recCol].v) : "")) ||
        "";
      if (!raw) continue;
      valid++;
      const v = raw.trim().toLowerCase();
      if (v === "oui" || v === "o" || v === "yes") yes++;
    }
    if (valid > 0) recommendationRate = yes / valid;
  }

  return { resort: sheetId, respondents, recommendationRate };
}
