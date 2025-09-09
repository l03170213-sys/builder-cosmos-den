import type { RequestHandler } from "express";
import { RESORTS } from "../resorts";

function parseGviz(text: string) {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  const json = text.slice(start + 1, end);
  return JSON.parse(json);
}

function cellToString(c: any) {
  if (!c) return "";
  // primitive types
  if (typeof c === "string") {
    // handle Google gviz date string like Date(2025,6,1)
    const m = c.match && c.match(/^Date\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) return formatDateToFR(`${m[3]}/${Number(m[2]) + 1}/${m[1]}`);
    return c;
  }
  if (typeof c === "number") return String(c);

  // object returned by gviz {v: ..., f: ...}
  if (c && typeof c === "object") {
    if (c.f != null) return String(c.f);
    if (c.v == null) return "";
    const v = c.v;
    if (typeof v === "string") {
      // Date string like Date(2025,6,1) sometimes appears
      const dm = v.match(/^Date\((\d+),\s*(\d+),\s*(\d+)/);
      if (dm) return formatDateToFR(`${dm[3]}/${Number(dm[2]) + 1}/${dm[1]}`);
      return v;
    }
    if (typeof v === "number") {
      // Could be excel serial representing a date — try convert if large (>30000)
      if (v > 30000) {
        const excelEpoch = new Date(Date.UTC(1899, 11, 30));
        const dt2 = new Date(
          excelEpoch.getTime() + Math.round(v) * 24 * 60 * 60 * 1000,
        );
        return `${String(dt2.getUTCDate()).padStart(2, "0")}/${String(dt2.getUTCMonth() + 1).padStart(2, "0")}/${dt2.getUTCFullYear()}`;
      }
      return String(v);
    }
    // fallback
    return String(v);
  }
  return "";
}

function formatDateToFR(raw: string) {
  if (!raw) return "";
  const s = raw.toString().trim();
  const dateWithTimeMatch = s.match(/^(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+/);
  if (dateWithTimeMatch) return dateWithTimeMatch[1];
  const dmY = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmY)
    return `${dmY[1].padStart(2, "0")}/${dmY[2].padStart(2, "0")}/${dmY[3].length === 2 ? "20" + dmY[3] : dmY[3]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dt = new Date(s);
  if (!isNaN(dt.getTime()))
    return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
  const num = Number(s);
  if (!Number.isNaN(num) && num > 0) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const dt2 = new Date(
      excelEpoch.getTime() + Math.round(num) * 24 * 60 * 60 * 1000,
    );
    return `${String(dt2.getUTCDate()).padStart(2, "0")}/${String(dt2.getUTCMonth() + 1).padStart(2, "0")}/${dt2.getUTCFullYear()}`;
  }
  return s;
}

export const getResortRespondentDetails: RequestHandler = async (req, res) => {
  try {
    const resortKey = req.params.resort as string;
    const cfg = RESORTS[resortKey];
    if (!cfg) return res.status(404).json({ error: "Unknown resort" });

    const SHEET_ID = cfg.sheetId;
    const GID_MATRICE_MOYENNE = cfg.gidMatrice ?? "0";

    const qEmail = (req.query.email || "").toString().trim().toLowerCase();
    const qName = (req.query.name || "").toString().trim().toLowerCase();
    const qDate = (req.query.date || "").toString().trim();

    const PESTANA_CATEGORY_NAMES = [
      "🌟 APPRÉCIATION GLOBALE",
      "✈️ TRANSPORTS Aérien",
      "🚐 Car navette",
      "🏨 HÉBERGEMENT",
      "🛏️ CHAMBRES",
      "🏊 PISCINE",
      "🎉 ANIMATION",
      "👥 ÉQUIPES",
      "🤝 Représentant Top of Travel",
      "🌍 EXCURSIONS",
    ];
    const normalizeName = (s: string) =>
      (s || "")
        .toString()
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    const isPestana = resortKey === "pestana-royal-ocean-madeira";

    // First, fetch sheet1 (respondents raw sheet) to extract per-respondent category values and feedback
    const sheet1Url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
    const sr = await fetch(sheet1Url);
    if (!sr.ok)
      return res
        .status(502)
        .json({ error: "Unable to fetch sheet1 (respondents)" });
    const stext = await sr.text();
    const sjson = parseGviz(stext);
    const scols: string[] = (sjson.table.cols || []).map((c: any) =>
      (c.label || "").toString(),
    );
    const srows: any[] = sjson.table.rows || [];

    // Helper to normalize headers
    const normalize = (s: string) =>
      (s || "")
        .toString()
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    const TARGET_FEEDBACK_TITLE = "Votre avis compte pour nous ! :)";
    const feedbackColExactInSheet1 = scols.findIndex(
      (c) => normalize(c) === normalize(TARGET_FEEDBACK_TITLE),
    );

    // Try to find respondent row in sheet1 by email/name/date
    const findRespondentRowInSheet1 = () => {
      const qEmail = (req.query.email || "").toString().trim().toLowerCase();
      const qName = (req.query.name || "").toString().trim().toLowerCase();
      const qDate = (req.query.date || "").toString().trim();
      const targetDate = qDate ? formatDateToFR(qDate) : "";

      const candidates: number[] = [];
      for (let i = 0; i < srows.length; i++) {
        const r = srows[i];
        const c = r.c || [];
        let matched = false;
        for (let ci = 0; ci < c.length; ci++) {
          const cellVal =
            c[ci] && c[ci].v != null
              ? String(c[ci].v).trim().toLowerCase()
              : "";
          if (!cellVal) continue;
          if (qEmail && (cellVal === qEmail || cellVal.includes(qEmail))) {
            matched = true;
            break;
          }
          if (qName && (cellVal === qName || cellVal.includes(qName))) {
            matched = true;
            break;
          }
        }
        if (matched) candidates.push(i);
      }

      if (candidates.length === 0 && !req.query.name) {
        for (let i = 0; i < srows.length; i++) {
          const first =
            srows[i].c && srows[i].c[0] && srows[i].c[0].v != null
              ? String(srows[i].c[0].v).trim().toLowerCase()
              : "";
          if (
            first === "anonyme" ||
            first === "anonymé" ||
            first === "anonym"
          ) {
            candidates.push(i);
            break;
          }
        }
      }

      if (candidates.length === 0) return -1;
      if (candidates.length === 1) return candidates[0];

      // Disambiguate by date if provided
      if (targetDate) {
        for (const idx of candidates) {
          const cells = srows[idx].c || [];
          const matchesDate = cells.some(
            (cell: any) =>
              formatDateToFR(cellToString(cell)) === targetDate &&
              targetDate !== "",
          );
          if (matchesDate) return idx;
        }
      }
      return candidates[0];
    };

    const sheet1RowIdx = findRespondentRowInSheet1();

    // helper to finalize result for Pestana: force category order and overall from column L when possible
    const finalizeAndSend = (
      result: any,
      scells?: any[],
      mrows?: any[],
      lastRow?: any,
      respColIndex?: number,
      overallIdx?: number,
    ) => {
      if (isPestana) {
        const cats: { name: string; value: string }[] = [];
        // prefer matrice values per-respondent when available
        for (let i = 0; i < PESTANA_CATEGORY_NAMES.length; i++) {
          const catName = PESTANA_CATEGORY_NAMES[i];
          let val = "";
          const rowIndex = i + 1; // mapping: category rows start at index 1 in matrice
          if (
            mrows &&
            typeof respColIndex === "number" &&
            respColIndex !== -1
          ) {
            const mrow = mrows[rowIndex];
            if (
              mrow &&
              mrow.c &&
              mrow.c[respColIndex] &&
              mrow.c[respColIndex].v != null
            ) {
              val = String(mrow.c[respColIndex].v);
            }
          }
          // fallback to matrice overall column for that row
          if (!val && mrows && typeof overallIdx === "number") {
            const mrow = mrows[rowIndex];
            if (
              mrow &&
              mrow.c &&
              mrow.c[overallIdx] &&
              mrow.c[overallIdx].v != null
            )
              val = String(mrow.c[overallIdx].v);
          }
          // fallback to scells if present (sheet1 raw respondent row)
          if (!val && scells) {
            const fallbackCell = scells[rowIndex];
            if (fallbackCell && fallbackCell.v != null)
              val = String(fallbackCell.v);
          }
          cats.push({ name: catName, value: val });
        }
        result.categories = cats;

        // overall: prefer scells column L (index 11) if present, else matrice per-respondent value, else matrice overall
        let overall = result.overall || null;
        if (scells && scells[11] && scells[11].v != null)
          overall = String(scells[11].v);
        else if (
          mrows &&
          typeof respColIndex === "number" &&
          respColIndex !== -1 &&
          lastRow &&
          lastRow.c &&
          lastRow.c[respColIndex] &&
          lastRow.c[respColIndex].v != null
        )
          overall = String(lastRow.c[respColIndex].v);
        else if (
          lastRow &&
          typeof overallIdx === "number" &&
          lastRow.c &&
          lastRow.c[overallIdx] &&
          lastRow.c[overallIdx].v != null
        )
          overall = String(lastRow.c[overallIdx].v);
        result.overall = overall;
      }
      return res.status(200).json(result);
    };

    // Extract per-category values from sheet1 row if found
    if (sheet1RowIdx !== -1) {
      const srow = srows[sheet1RowIdx];
      const scells = srow.c || [];
      const lastIdx = Math.max(0, scells.length - 1);
      // determine metadata columns to exclude (name/email/date/age/postal/duration)
      const metaKeywords = [
        "email",
        "courriel",
        "@",
        "date",
        "nom",
        "name",
        "âge",
        "age",
        "postal",
        "code postal",
        "postcode",
        "zip",
        "durée",
        "duree",
        "duration",
        "séjour",
        "sejour",
      ];
      const metaIdxs = new Set<number>();
      for (let i = 0; i < scols.length; i++) {
        const h = normalize(scols[i] || "");
        for (const k of metaKeywords)
          if (h.includes(k)) {
            metaIdxs.add(i);
            break;
          }
      }
      // mark feedback column as meta too
      if (feedbackColExactInSheet1 !== -1)
        metaIdxs.add(feedbackColExactInSheet1);
      if (71 < scells.length) metaIdxs.add(71);

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
        { colIndex: 9, name: "�� Représentant Top of Travel" },
        { colIndex: 10, name: "🌍 EXCURSIONS" },
        { colIndex: 11, name: "MOYENNE GÉNÉRALE" },
      ];

      const cats: { name: string; value: string }[] = [];
      for (const m of fixedCategoryMapping) {
        const cell = scells[m.colIndex];
        const val = cellToString(cell);
        cats.push({ name: m.name, value: val });
      }

      // prepare a result skeleton; overall & feedback to be resolved below
      const result = {
        categories: cats,
        overall: null as null | string,
        column: null as null | string,
        feedback: null as null | string,
      };

      // feedback from sheet1: prefer exact header, else BT
      let fcell: any = null;
      if (
        feedbackColExactInSheet1 !== -1 &&
        scells[feedbackColExactInSheet1] &&
        scells[feedbackColExactInSheet1].v != null
      )
        fcell = scells[feedbackColExactInSheet1];
      else if (scells[71] && scells[71].v != null) fcell = scells[71];
      result.feedback = fcell ? String(fcell.v) : null;

      // Now fetch matrice to determine 'overall' (Note général) from column L (index 11) mapped to this respondent
      try {
        const mgurl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID_MATRICE_MOYENNE}`;
        const mr = await fetch(mgurl);
        if (mr.ok) {
          const mtext = await mr.text();
          const mjson = parseGviz(mtext);
          const mcols: string[] = (mjson.table.cols || []).map((c: any) =>
            (c.label || "").toString(),
          );
          const mrows: any[] = mjson.table.rows || [];

          // attempt cols-as-respondents: find column whose header matches email or name
          // Prefer email from sheet1 column D (index 3), else fall back to scanning
          const emailCellPreferred =
            srow.c && srow.c[3] && srow.c[3].v != null ? srow.c[3] : null;
          const emailCellVal =
            emailCellPreferred ||
            (srow.c || []).find(
              (c: any) => c && c.v && String(c.v).toString().includes("@"),
            );
          const emailVal = emailCellVal
            ? String(emailCellVal.v).trim().toLowerCase()
            : "";
          // The respondent name is in sheet1 column E (index 4)
          const nameVal =
            srow.c && srow.c[4] && srow.c[4].v != null
              ? String(srow.c[4].v).trim().toLowerCase()
              : "";

          let overallVal: string | null = null;

          // try to find col label in matrice matching email or name and remember column index
          let respColIndex = -1;
          for (let ci = 0; ci < mcols.length; ci++) {
            const lbl = (mcols[ci] || "").toString().trim().toLowerCase();
            if (!lbl) continue;
            if (emailVal && lbl.includes(emailVal)) {
              respColIndex = ci;
              break;
            }
            if (nameVal && lbl.includes(nameVal)) {
              respColIndex = ci;
              break;
            }
          }

          // Find last non-empty row in matrice (for Pestana this is the global averages row)
          let lastRow: any = null;
          for (let ri = mrows.length - 1; ri >= 0; ri--) {
            const rr = mrows[ri];
            const hasValue = (rr?.c ?? []).some(
              (cell: any) => cell && cell.v != null && cell.v !== "",
            );
            if (hasValue) {
              lastRow = rr;
              break;
            }
          }
          if (!lastRow) lastRow = mrows[mrows.length - 1];
          const lastRowCells: any[] = lastRow?.c || [];
          const overallIdx = lastRow
            ? 11 < lastRowCells.length
              ? 11
              : Math.max(0, lastRowCells.length - 1)
            : 11;

          // If respColIndex found, build categories from rows B..K (indices 1..10) reading that column
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

          const newCats: { name: string; value: string }[] = [];

          if (respColIndex !== -1) {
            // For each category B..K (colIndex 1..10), find the row in mrows whose first cell matches the category name when possible
            for (let i = 1; i <= 10; i++) {
              const catName =
                fixedCategoryMapping.find((f) => f.colIndex === i)?.name ||
                `Col ${i}`;
              // try to find row by matching first cell text using normalize()
              let foundRow = -1;
              for (let ri = 0; ri < mrows.length; ri++) {
                const first =
                  mrows[ri] && mrows[ri].c && mrows[ri].c[0]
                    ? cellToString(mrows[ri].c[0])
                    : "";
                if (first && normalize(first) === normalize(catName || "")) {
                  foundRow = ri;
                  break;
                }
              }
              // fallback to index-based row (i-1)
              if (foundRow === -1) foundRow = i - 1;
              const mrow = mrows[foundRow];
              const val =
                mrow &&
                mrow.c &&
                mrow.c[respColIndex] &&
                mrow.c[respColIndex].v != null
                  ? String(mrow.c[respColIndex].v)
                  : "";
              newCats.push({ name: catName, value: val });
            }

            // For Pestana, overall should be taken from last non-empty row column L (index 11)
            let overallValFromMatrice: string | null = null;
            if (isPestana) {
              const c = lastRowCells[11];
              overallValFromMatrice = c && c.v != null ? String(c.v) : null;
            } else {
              // for other resorts prefer respondent column at last row
              const c = lastRow && lastRow.c && lastRow.c[respColIndex];
              overallValFromMatrice = c && c.v != null ? String(c.v) : null;
            }

            result.categories = [
              {
                name: "Nom",
                value:
                  scells[4] && scells[4].v != null
                    ? String(scells[4].v)
                    : scells[0] && scells[0].v != null
                      ? String(scells[0].v)
                      : "",
              },
              ...newCats,
            ];
            result.overall = overallValFromMatrice || null;
          } else {
            // respColIndex not found: keep previous fallback logic (use overallIdx and row indexing)
            for (const m of fixedCategoryMapping) {
              let val = "";
              if (m.colIndex === 0) {
                val =
                  scells[4] && scells[4].v != null
                    ? String(scells[4].v)
                    : scells[0] && scells[0].v != null
                      ? String(scells[0].v)
                      : "";
              } else if (m.colIndex === 11) {
                const c = lastRowCells[overallIdx];
                val =
                  c && c.v != null
                    ? String(c.v)
                    : scells[m.colIndex] && scells[m.colIndex].v != null
                      ? String(scells[m.colIndex].v)
                      : "";
              } else {
                const rowIndex = m.colIndex - 1;
                const mrow = mrows[rowIndex];
                if (
                  mrow &&
                  mrow.c &&
                  mrow.c[overallIdx] &&
                  mrow.c[overallIdx].v != null
                ) {
                  val = String(mrow.c[overallIdx].v);
                } else {
                  val =
                    scells[m.colIndex] && scells[m.colIndex].v != null
                      ? String(scells[m.colIndex].v)
                      : "";
                }
              }
              newCats.push({ name: m.name, value: val });
            }
            result.categories = newCats;
            result.overall =
              lastRowCells[overallIdx] && lastRowCells[overallIdx].v != null
                ? String(lastRowCells[overallIdx].v)
                : null;
          }
          result.overall = overallVal;
        }
      } catch (e) {
        console.error("Failed to fetch matrice for overall:", e);
      }

      return res.status(200).json(result);
    }

    // If respondent not found in sheet1, fall back to previous matrice-first logic
    const gurl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID_MATRICE_MOYENNE}`;
    const rr = await fetch(gurl);
    if (!rr.ok)
      return res.status(502).json({ error: "Unable to fetch matrice" });
    const text = await rr.text();
    const json = parseGviz(text);
    const cols: string[] = (json.table.cols || []).map((c: any) =>
      (c.label || "").toString(),
    );
    const rows: any[] = json.table.rows || [];

    // Try direct row param (for debugging / forced lookup)
    const qRowNum = req.query.row ? parseInt(String(req.query.row), 10) : NaN;
    const targetDate = qDate ? formatDateToFR(qDate) : "";

    const result = {
      categories: null as null | { name: string; value: string }[],
      overall: null as null | string,
      column: null as null | string,
      feedback: null as null | string,
    };

    if (!Number.isNaN(qRowNum) && qRowNum > 0 && qRowNum - 1 < rows.length) {
      const chosenIdx = qRowNum - 1;
      const row = rows[chosenIdx];
      const cells = row.c || [];
      const lastCellIdx = Math.max(0, cells.length - 1);
      let overallIndex = 11;
      if (!(cells[11] && cells[11].v != null)) {
        overallIndex = Math.max(0, Math.min(cols.length - 1, lastCellIdx));
      }
      const cats: { name: string; value: string }[] = [];
      for (let i = 1; i <= lastCellIdx; i++) {
        if (i === overallIndex) continue;
        const catName = cols[i] && cols[i] !== "" ? cols[i] : `Col ${i + 1}`;
        const val = cells[i] && cells[i].v != null ? String(cells[i].v) : "";
        cats.push({ name: catName, value: val });
      }
      const overallCell =
        cells[overallIndex] && cells[overallIndex].v != null
          ? cells[overallIndex]
          : null;
      const overall = overallCell ? String(overallCell.v) : null;
      // extract exact feedback column value if present
      let feedbackCell: any = null;
      if (
        feedbackColExact !== -1 &&
        cells[feedbackColExact] &&
        cells[feedbackColExact].v != null
      )
        feedbackCell = cells[feedbackColExact];
      else if (cells[71] && cells[71].v != null) feedbackCell = cells[71];
      const feedback = feedbackCell ? String(feedbackCell.v) : null;
      result.categories = cats;
      result.overall = overall;
      result.column = null;
      result.feedback = feedback;
      return res.status(200).json(result);
    }

    // Try rows-as-respondents
    const candidateRowIdxs: number[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const c = r.c || [];
      // scan all cells in the row to find exact or partial email/name match
      let matched = false;
      for (let ci = 0; ci < c.length; ci++) {
        const cellVal =
          c[ci] && c[ci].v != null ? String(c[ci].v).trim().toLowerCase() : "";
        if (!cellVal) continue;
        if (cellVal === qEmail || cellVal === qName) {
          matched = true;
          break;
        }
        if (qEmail && cellVal.includes(qEmail)) {
          matched = true;
          break;
        }
        if (qName && cellVal.includes(qName)) {
          matched = true;
          break;
        }
      }
      if (matched) candidateRowIdxs.push(i);
    }

    // If no candidate rows were found but user did not provide a name, fallback to any 'Anonyme' row
    if (candidateRowIdxs.length === 0 && !qName) {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const c = r.c || [];
        const first =
          c[0] && c[0].v != null ? String(c[0].v).trim().toLowerCase() : "";
        if (first === "anonyme" || first === "anonymé" || first === "anonym") {
          candidateRowIdxs.push(i);
          break;
        }
      }
    }

    if (candidateRowIdxs.length >= 1) {
      let chosenIdx = -1;
      if (candidateRowIdxs.length === 1) chosenIdx = candidateRowIdxs[0];
      else {
        for (const idx of candidateRowIdxs) {
          const row = rows[idx];
          const cells = row.c || [];
          const hasDateMatch = cells.some(
            (cell: any) =>
              formatDateToFR(cellToString(cell)) === targetDate &&
              targetDate !== "",
          );
          if (hasDateMatch) {
            chosenIdx = idx;
            break;
          }
        }
        if (chosenIdx === -1) chosenIdx = candidateRowIdxs[0];
      }

      const row = rows[chosenIdx];
      const cells = row.c || [];
      const lastCellIdx = Math.max(0, cells.length - 1);
      let overallIndex = 11;
      if (!(cells[11] && cells[11].v != null)) {
        overallIndex = Math.max(0, Math.min(cols.length - 1, lastCellIdx));
      }

      const cats: { name: string; value: string }[] = [];
      for (let i = 1; i <= lastCellIdx; i++) {
        if (i === overallIndex) continue;
        const catName = cols[i] && cols[i] !== "" ? cols[i] : `Col ${i + 1}`;
        const val = cells[i] && cells[i].v != null ? String(cells[i].v) : "";
        cats.push({ name: catName, value: val });
      }

      const overallCell =
        cells[overallIndex] && cells[overallIndex].v != null
          ? cells[overallIndex]
          : null;
      const overall = overallCell ? String(overallCell.v) : null;

      result.categories = cats;
      result.overall = overall;
      result.column = null;

      return res.status(200).json(result);
    }

    // Try cols-as-respondents: find column index
    let colIndex = -1;
    for (let i = 0; i < cols.length; i++) {
      const lbl = (cols[i] || "").toString().trim().toLowerCase();
      if (!lbl) continue;
      if (lbl === qEmail || lbl === qName) {
        colIndex = i;
        break;
      }
    }
    if (colIndex === -1) {
      for (let i = 0; i < cols.length; i++) {
        const lbl = (cols[i] || "").toString().trim().toLowerCase();
        if (!lbl) continue;
        if (qEmail && lbl.includes(qEmail)) {
          colIndex = i;
          break;
        }
        if (qName && lbl.includes(qName)) {
          colIndex = i;
          break;
        }
      }
    }

    if (colIndex !== -1) {
      const cats: { name: string; value: string }[] = [];
      for (const r of rows) {
        const cells = r.c || [];
        const catName =
          cells[0] && cells[0].v != null ? String(cells[0].v) : "";
        const val =
          cells[colIndex] && cells[colIndex].v != null
            ? String(cells[colIndex].v)
            : "";
        if (catName) cats.push({ name: catName, value: val });
      }
      const lastRow = rows[rows.length - 1];
      const overallCell = lastRow && lastRow.c && lastRow.c[colIndex];
      const overall =
        overallCell && overallCell.v != null ? String(overallCell.v) : null;
      // get feedback from exact feedback column if present (in last row) or fallback to BT (index 71)
      let feedbackCell: any = null;
      if (
        feedbackColExact !== -1 &&
        lastRow &&
        lastRow.c &&
        lastRow.c[feedbackColExact] &&
        lastRow.c[feedbackColExact].v != null
      )
        feedbackCell = lastRow.c[feedbackColExact];
      else if (lastRow && lastRow.c && lastRow.c[71] && lastRow.c[71].v != null)
        feedbackCell = lastRow.c[71];
      const feedback = feedbackCell ? String(feedbackCell.v) : null;
      result.categories = cats;
      result.overall = overall;
      result.feedback = feedback;
      result.column = (function (i) {
        let col = "";
        let n = i + 1;
        while (n > 0) {
          const rem = (n - 1) % 26;
          col = String.fromCharCode(65 + rem) + col;
          n = Math.floor((n - 1) / 26);
        }
        return col;
      })(colIndex);

      return res.status(200).json(result);
    }

    // Last resort: try to locate respondent row in sheet1 and map to matrice row by index
    try {
      const sheet1Url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
      const sr = await fetch(sheet1Url);
      if (sr.ok) {
        const stext = await sr.text();
        const sjson = parseGviz(stext);
        const srows: any[] = sjson.table.rows || [];
        // find row index in sheet1 matching email/name/date
        let foundIdx = -1;
        for (let i = 0; i < srows.length; i++) {
          const rc = srows[i].c || [];
          for (const cell of rc) {
            const v =
              cell && cell.v != null ? String(cell.v).trim().toLowerCase() : "";
            if (!v) continue;
            if (qEmail && v === qEmail) {
              foundIdx = i;
              break;
            }
            if (qName && v === qName) {
              foundIdx = i;
              break;
            }
            if (qEmail && v.includes(qEmail)) {
              foundIdx = i;
              break;
            }
            if (qName && v.includes(qName)) {
              foundIdx = i;
              break;
            }
          }
          if (foundIdx !== -1) break;
          // date match
          if (qDate) {
            const anyCellMatchesDate = (srows[i].c || []).some(
              (cell: any) =>
                formatDateToFR(cellToString(cell)) === formatDateToFR(qDate),
            );
            if (anyCellMatchesDate) {
              foundIdx = i;
              break;
            }
          }
        }
        if (foundIdx !== -1 && foundIdx < rows.length) {
          const row = rows[foundIdx];
          const cells = row.c || [];
          const lastCellIdx = Math.max(0, cells.length - 1);
          let overallIndex = 11;
          if (!(cells[11] && cells[11].v != null)) {
            overallIndex = Math.max(0, Math.min(cols.length - 1, lastCellIdx));
          }
          const cats: { name: string; value: string }[] = [];
          for (let i = 1; i <= lastCellIdx; i++) {
            if (i === overallIndex) continue;
            const catName =
              cols[i] && cols[i] !== "" ? cols[i] : `Col ${i + 1}`;
            const val =
              cells[i] && cells[i].v != null ? String(cells[i].v) : "";
            cats.push({ name: catName, value: val });
          }
          const overallCell =
            cells[overallIndex] && cells[overallIndex].v != null
              ? cells[overallIndex]
              : null;
          const overall = overallCell ? String(overallCell.v) : null;
          // extract exact feedback column value if present
          let feedbackCell: any = null;
          if (
            feedbackColExact !== -1 &&
            cells[feedbackColExact] &&
            cells[feedbackColExact].v != null
          )
            feedbackCell = cells[feedbackColExact];
          else if (cells[71] && cells[71].v != null) feedbackCell = cells[71];
          const feedback = feedbackCell ? String(feedbackCell.v) : null;
          result.categories = cats;
          result.overall = overall;
          result.column = null;
          result.feedback = feedback;
          return res.status(200).json(result);
        }
      }
    } catch (e) {
      console.error("sheet1 mapping attempt failed:", e);
    }

    return res.status(404).json({ error: "Respondent not found in matrice" });
  } catch (err) {
    console.error("Failed to fetch respondent details:", err);
    return res.status(500).json({ error: "Unable to load respondent details" });
  }
};
