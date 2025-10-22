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
    // enable debug when explicit flag is set or when requesting respondent named KIEHL
    const isDebug =
      req.query.debug === "1" ||
      (req.query.name || "").toString().trim().toLowerCase() === "kiehl";
    if (!cfg) {
      if (isDebug)
        return res
          .status(404)
          .json({ error: "Unknown resort", _debug: { resortKey } });
      return res.status(404).json({ error: "Unknown resort" });
    }

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
      "🤝 Repr��sentant Top of Travel",
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
    if (!sr.ok) {
      if (isDebug) {
        return res
          .status(502)
          .json({
            error: "Unable to fetch sheet1 (respondents)",
            _debug: { sheet1Url, status: sr.status },
          });
      }
      return res
        .status(502)
        .json({ error: "Unable to fetch sheet1 (respondents)" });
    }
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

    // normalize helper to strip diacritics and collapse spaces for robust matching
    function normalizeDiacritics(s: string) {
      if (!s) return "";
      try {
        return s
          .toString()
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      } catch (e) {
        return s.toString().trim().toLowerCase();
      }
    }
    const TARGET_FEEDBACK_TITLE = "Votre avis compte pour nous ! :)";
    // detect feedback column by exact title, then by partial match, then fallback to BT (index 71) when available
    let feedbackColIdx = scols.findIndex((c) => normalize(c) === normalize(TARGET_FEEDBACK_TITLE));
    if (feedbackColIdx === -1) {
      const lowerNames = scols.map((c) => normalize(c || ""));
      feedbackColIdx = lowerNames.findIndex((h) => h.includes("votre avis") || h.includes("votre avis compte"));
    }
    if (feedbackColIdx === -1 && scols.length > 71) feedbackColIdx = 71;

    // Try to find respondent row in sheet1 by email/name/date
    const findRespondentRowInSheet1 = () => {
      // If caller provided an explicit row index, use it (1-based in client)
      const qRowNumExplicit = req.query.row
        ? parseInt(String(req.query.row), 10)
        : NaN;
      if (
        !Number.isNaN(qRowNumExplicit) &&
        qRowNumExplicit > 0 &&
        qRowNumExplicit - 1 < srows.length
      ) {
        return qRowNumExplicit - 1;
      }

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
          // Use column C (index 2) specifically for date matching
          const dateCell = cells[2];
          const matchesDate =
            dateCell &&
            formatDateToFR(cellToString(dateCell)) === targetDate &&
            targetDate !== "";
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

      // derive likely name/email column indices from sheet headers to be robust across hotels
      const findHeaderIndex = (candidates: string[]) => {
        for (let i = 0; i < scols.length; i++) {
          const h = normalize(scols[i] || "");
          for (const cand of candidates) if (h.includes(cand)) return i;
        }
        return -1;
      };
      const inferredNameIdx = findHeaderIndex([
        "nom",
        "name",
        "client",
        "label",
      ]); // prefer header labels
      const inferredEmailIdx = findHeaderIndex(["email", "courriel", "@"]);
      const nameIdx =
        inferredNameIdx !== -1 ? inferredNameIdx : scells[4] ? 4 : 0;
      const emailIdx =
        inferredEmailIdx !== -1 ? inferredEmailIdx : scells[3] ? 3 : -1;
      const scellVal = (idx: number) =>
        idx != null && scells[idx] && scells[idx].v != null
          ? String(scells[idx].v).trim()
          : "";

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
      if (typeof feedbackColIdx === "number" && feedbackColIdx !== -1)
        metaIdxs.add(feedbackColIdx);
      if (71 < scells.length) metaIdxs.add(71);

      // Fixed column indices used as fallback only. Preferred category names are taken from the matrice (mcols or first cell of rows).
      const fixedCategoryMapping = [
        { colIndex: 0, name: "Nom" },
        { colIndex: 1, name: "🌟 APPRÉCIATION GLOBALE" },
        { colIndex: 2, name: "✈️ TRANSPORTS Aérien" },
        { colIndex: 3, name: "🚐 Car navette" },
        { colIndex: 4, name: "��� HÉBERGEMENT" },
        { colIndex: 5, name: "🛏️ CHAMBRES" },
        { colIndex: 6, name: "🏊 PISCINE" },
        { colIndex: 7, name: "🎉 ANIMATION" },
        { colIndex: 8, name: "👥 ÉQUIPES" },
        { colIndex: 9, name: "🤝 Représentant Top of Travel" },
        { colIndex: 10, name: "🌍 EXCURSIONS" },
        { colIndex: 11, name: "MOYENNE GÉNÉRALE" },
      ];

      // helper: parse rating-like cell to readable string, prefer numeric within 0-5
      function parseRatingCell(cell: any) {
        const s = cellToString(cell);
        const m = s && s.match && s.match(/-?\d+[.,]?\d*/g);
        if (m && m.length) {
          const n = Number(String(m[0]).replace(",", "."));
          if (Number.isFinite(n) && n >= 0 && n <= 5)
            return String(Number(n.toFixed(2)));
        }
        return s || "";
      }

      // Try to prefer values from the matrice row that corresponds to this respondent
      let cats: { name: string; value: string }[] = [];
      let matchedMatriceRow: any = undefined;
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

          const targetName =
            nameIdx != null && nameIdx >= 0
              ? String(scellVal(nameIdx)).trim().toLowerCase()
              : "";
          const targetEmail =
            emailIdx != null && emailIdx >= 0
              ? String(scellVal(emailIdx)).trim().toLowerCase()
              : "";

          matchedMatriceRow = null;
          for (let ri = 0; ri < mrows.length; ri++) {
            const mrow = mrows[ri];
            const cells = mrow.c || [];
            const firstRaw = cellToString(cells[0]) || "";
            const firstNorm = normalizeDiacritics(firstRaw);
            const targetNameNorm = normalizeDiacritics(targetName);
            const targetEmailNorm = (targetEmail || "")
              .toString()
              .trim()
              .toLowerCase();

            // priority: exact/normalized match on first cell (most reliable)
            if (
              firstNorm &&
              targetNameNorm &&
              (firstNorm === targetNameNorm ||
                firstNorm.includes(targetNameNorm) ||
                targetNameNorm.includes(firstNorm))
            ) {
              matchedMatriceRow = mrow;
              break;
            }

            // search any cell for email or normalized name tokens
            const normCells = (cells || []).map((c: any) =>
              normalizeDiacritics(cellToString(c)),
            );
            if (
              targetEmailNorm &&
              normCells.some((v) => v && v.includes(targetEmailNorm))
            ) {
              matchedMatriceRow = mrow;
              break;
            }
            if (
              targetNameNorm &&
              normCells.some(
                (v) =>
                  v &&
                  (v.includes(targetNameNorm) || targetNameNorm.includes(v)),
              )
            ) {
              matchedMatriceRow = mrow;
              break;
            }
          }

          if (matchedMatriceRow) {
            const cells = matchedMatriceRow.c || [];
            for (let i = 1; i <= 10; i++) {
              // prefer category name taken from matrice column headers (mcols) if available, else fallback to fixed mapping
              let name =
                mcols && mcols[i] && String(mcols[i]).trim()
                  ? String(mcols[i])
                  : fixedCategoryMapping.find((f) => f.colIndex === i)?.name ||
                    `Col ${i}`;
              const cell = cells[i];
              // only accept numeric-like values from matrice (avoid 'OUI')
              const parsed = parseRatingCell(cell);
              // if parsed looks like a number, use it, else keep empty string
              cats.push({
                name,
                value:
                  parsed && parsed.match(/^-?\d+(?:[.,]\d+)?$/) ? parsed : "",
              });
            }
            // overall will be taken from matchedMatriceRow column L later
          } else {
            // Try to use the same row index from sheet1 as a fallback (often sheets keep respondents aligned by row)
            if (
              typeof sheet1RowIdx === "number" &&
              sheet1RowIdx >= 0 &&
              sheet1RowIdx < mrows.length
            ) {
              const candidateRow = mrows[sheet1RowIdx];
              if (candidateRow) {
                const cells = candidateRow.c || [];
                for (let i = 1; i <= 10; i++) {
                  // prefer mcols name when available
                  let name =
                    mcols && mcols[i] && String(mcols[i]).trim()
                      ? String(mcols[i])
                      : fixedCategoryMapping.find((f) => f.colIndex === i)
                          ?.name || `Col ${i}`;
                  const cell = cells[i];
                  const parsed = parseRatingCell(cell);
                  cats.push({
                    name,
                    value:
                      parsed && parsed.match(/^-?\d+(?:[.,]\d+)?$/)
                        ? parsed
                        : "",
                  });
                }
              } else {
                for (let i = 1; i <= 10; i++) {
                  const name =
                    fixedCategoryMapping.find((f) => f.colIndex === i)?.name ||
                    `Col ${i}`;
                  cats.push({ name, value: "" });
                }
              }
            } else {
              // NO FALLBACK to sheet1 for category numeric values — must come from matrice
              for (let i = 1; i <= 10; i++) {
                const name =
                  fixedCategoryMapping.find((f) => f.colIndex === i)?.name ||
                  `Col ${i}`;
                cats.push({ name, value: "" });
              }
            }
          }
        } else {
          // couldn't fetch matrice — return empty category values (do not use sheet1 'OUI')
          for (let i = 1; i <= 10; i++) {
            const name =
              fixedCategoryMapping.find((f) => f.colIndex === i)?.name ||
              `Col ${i}`;
            cats.push({ name, value: "" });
          }
        }
      } catch (e) {
        console.error(
          "Failed to use matrice row for respondent categories:",
          e,
        );
        for (let i = 1; i <= 10; i++) {
          const name =
            fixedCategoryMapping.find((f) => f.colIndex === i)?.name ||
            `Col ${i}`;
          cats.push({ name, value: "" });
        }
      }

      // prepare a result skeleton; overall & feedback to be resolved below
      const result: any = {
        categories: cats,
        overall: null as null | string,
        column: null as null | string,
        feedback: null as null | string,
        date: null as null | string,
        age: null as null | string,
        postal: null as null | string,
        duration: null as null | string,
        name: null as null | string,
        email: null as null | string,
      };

      // feedback from sheet1: prefer detected header index (feedbackColIdx), else BT (index 71)
    let fcell: any = null;
    if (typeof feedbackColIdx !== "undefined" && feedbackColIdx !== -1 && scells[feedbackColIdx] && scells[feedbackColIdx].v != null)
      fcell = scells[feedbackColIdx];
    else if (scells[71] && scells[71].v != null) fcell = scells[71];
    result.feedback = fcell ? String(fcell.v) : null;

      // attach meta fields (date, age BK, postal, duration, name, email) from sheet1 when available
      try {
        result.date =
          scells[2] && scells[2].v != null ? String(scells[2].v) : null;
      } catch (e) {}
      try {
        result.age =
          scells[62] && scells[62].v != null ? String(scells[62].v) : null;
      } catch (e) {}
      try {
        result.postal =
          scells[8] && scells[8].v != null ? String(scells[8].v) : null;
      } catch (e) {}
      try {
        // attempt to find duration column by header heuristics
        const durIdx = scols.findIndex((h: string) => {
          const nh = normalize(h || "");
          return (
            nh.includes("dur") || nh.includes("séjour") || nh.includes("duree")
          );
        });
        if (durIdx !== -1 && scells[durIdx] && scells[durIdx].v != null)
          result.duration = String(scells[durIdx].v);
      } catch (e) {}
      try {
        result.name =
          scellVal(nameIdx) ||
          (scells[4] && scells[4].v != null ? String(scells[4].v) : null);
      } catch (e) {}
      try {
        result.email =
          scellVal(emailIdx) ||
          (scells[3] && scells[3].v != null ? String(scells[3].v) : null);
      } catch (e) {}

      // Prefer overall from matched matrice row column L (index 11) if available
      try {
        if (
          typeof matchedMatriceRow !== "undefined" &&
          matchedMatriceRow &&
          matchedMatriceRow.c &&
          matchedMatriceRow.c[11] &&
          matchedMatriceRow.c[11].v != null
        ) {
          result.overall = String(matchedMatriceRow.c[11].v);
        } else if (scells && scells[11] && scells[11].v != null) {
          // fallback to sheet1 column L if present
          result.overall = String(scells[11].v);
        }
      } catch (e) {
        console.error(
          "Error while determining respondent overall from matched matrice row:",
          e,
        );
      }

      // Now fetch matrice and extract per-respondent category values in a robust, unified way
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

          const emailCellPreferred = scellVal(emailIdx)
            ? { v: scellVal(emailIdx) }
            : null;
          const emailVal = emailCellPreferred
            ? String(emailCellPreferred.v).trim().toLowerCase()
            : "";
          const nameVal = scellVal(nameIdx)
            ? String(scellVal(nameIdx)).trim().toLowerCase()
            : "";

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

          const normHeader = (s: string) =>
            normalizeDiacritics(
              (s || "").toString().trim().toLowerCase(),
            ).replace(/[^a-z0-9@]+/g, "");
          const targetNameNorm = normalizeDiacritics(nameVal).replace(
            /\s+/g,
            "",
          );
          const targetEmailNorm = (emailVal || "")
            .toString()
            .trim()
            .toLowerCase();

          // Build header lookup from mcols and first row if available
          const headerIndexMap: Record<string, number> = {};
          for (let ci = 0; ci < mcols.length; ci++) {
            const key = normHeader(mcols[ci] || "");
            if (key) headerIndexMap[key] = ci;
          }
          if (mrows && mrows.length > 0) {
            const headerRow = mrows[0];
            const headerCells = (headerRow && headerRow.c) || [];
            for (let ci = 0; ci < headerCells.length; ci++) {
              const raw = cellToString(headerCells[ci] || "");
              const key = normalizeDiacritics(raw).replace(/[^a-z0-9@]+/g, "");
              if (key && headerIndexMap[key] == null) headerIndexMap[key] = ci;
            }
          }

          // Strategy A: columns-as-respondents — try to find respondent column index
          let respColIndex = -1;
          for (const lblKey of Object.keys(headerIndexMap)) {
            if (targetEmailNorm && lblKey.includes(targetEmailNorm)) {
              respColIndex = headerIndexMap[lblKey];
              break;
            }
            if (targetNameNorm && lblKey.includes(targetNameNorm)) {
              respColIndex = headerIndexMap[lblKey];
              break;
            }
          }

          // token matching on mcols labels if not found
          if (respColIndex === -1 && mcols && mcols.length) {
            const nameTokens = (nameVal || "")
              .split(/\s+/)
              .map((t) => normalizeDiacritics(t).replace(/[^a-z0-9]+/g, ""))
              .filter(Boolean);
            for (let ci = 0; ci < mcols.length; ci++) {
              const lbl = normHeader(mcols[ci] || "");
              if (!lbl) continue;
              if (targetEmailNorm && lbl.includes(targetEmailNorm)) {
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

          const newCats: { name: string; value: string }[] = [];

          if (respColIndex !== -1) {
            // columns-as-respondents: for each category, find its row and read the value at respColIndex
            for (let i = 1; i <= 10; i++) {
              // attempt to take the category name from the matrice row's first cell if present
              let foundRow = -1;
              // default to the i-1 row when available
              if (i - 1 < mrows.length) foundRow = i - 1;
              const mrow =
                foundRow !== -1 && mrows[foundRow] ? mrows[foundRow] : null;
              const catNameFromRow =
                mrow && mrow.c && mrow.c[0] ? cellToString(mrow.c[0]) : "";
              const catName =
                catNameFromRow ||
                (mcols && mcols[i]
                  ? mcols[i]
                  : fixedCategoryMapping.find((f) => f.colIndex === i)?.name ||
                    `Col ${i}`);
              let val = "";
              if (mrow && mrow.c) {
                const cell = mrow.c[respColIndex];
                if (cell && cell.v != null) val = parseRatingCell(cell);
              }
              newCats.push({ name: catName, value: val });
            }

            // Validate that most extracted values are numeric; otherwise this respColIndex is likely incorrect
            const numericCount = newCats.reduce(
              (acc, c) =>
                acc +
                (/^-?\d+(?:[.,]\d+)?$/.test(String(c.value || "").trim())
                  ? 1
                  : 0),
              0,
            );
            if (numericCount < Math.max(1, Math.floor(newCats.length * 0.6))) {
              // fallback to rows-as-respondents handling below
              // clear newCats and let rows-as-respondents logic run
              newCats.length = 0;
              // set respColIndex to -1 so the else branch (rows-as-respondents) executes
              respColIndex = -1;
            } else {
              // overall: look for a row with 'moyenne' or fallback to last non-empty row value
              let overallValFromMatrice: string | null = null;
              for (let ri = 0; ri < mrows.length; ri++) {
                const first =
                  mrows[ri] && mrows[ri].c && mrows[ri].c[0]
                    ? cellToString(mrows[ri].c[0])
                    : "";
                if (first && normalize(first).includes("moyenne")) {
                  const c = mrows[ri].c && mrows[ri].c[respColIndex];
                  if (c && c.v != null)
                    overallValFromMatrice = parseRatingCell(c);
                  break;
                }
              }
              if (!overallValFromMatrice) {
                // fallback to last non-empty row's value at respColIndex
                for (let ri = mrows.length - 1; ri >= 0; ri--) {
                  const c =
                    mrows[ri] && mrows[ri].c && mrows[ri].c[respColIndex];
                  if (c && c.v != null) {
                    overallValFromMatrice = parseRatingCell(c);
                    break;
                  }
                }
              }

              result.categories = [
                {
                  name: "Nom",
                  value:
                    scellVal(nameIdx) ||
                    (scells[0] && scells[0].v != null
                      ? String(scells[0].v)
                      : ""),
                },
                ...newCats,
              ];
              result.overall = overallValFromMatrice || null;
              result.column = String(respColIndex);
            }
          } else {
            // Strategy B: rows-as-respondents — find a row where any cell matches respondent name/email
            let matchedRowIdx = -1;
            const targetName = scellVal(nameIdx)
              ? String(scellVal(nameIdx)).trim().toLowerCase()
              : "";
            const targetEmail = scellVal(emailIdx)
              ? String(scellVal(emailIdx)).trim().toLowerCase()
              : "";

            for (let ri = 0; ri < mrows.length; ri++) {
              const cells = (mrows[ri] && mrows[ri].c) || [];
              const normCells = cells.map((c: any) =>
                normalizeDiacritics(cellToString(c) || "").replace(/\s+/g, ""),
              );
              if (
                targetEmail &&
                normCells.some((v) => v && v.includes(targetEmail))
              ) {
                matchedRowIdx = ri;
                break;
              }
              const targetNameD = normalizeDiacritics(targetName).replace(
                /\s+/g,
                "",
              );
              if (
                targetName &&
                normCells.some(
                  (v) =>
                    v && (v.includes(targetNameD) || targetNameD.includes(v)),
                )
              ) {
                matchedRowIdx = ri;
                break;
              }
            }

            if (matchedRowIdx !== -1) {
              const mrow = mrows[matchedRowIdx];
              // Determine for each fixed category the column index by matching headerIndexMap first, then fallback to expected colIndex
              // build categories by iterating over visible column headers (prefer mcols)
              const maxCols = Math.max(10, mcols.length - 1);
              for (let ci = 1; ci <= Math.min(maxCols, 20); ci++) {
                const headerName =
                  mcols && mcols[ci]
                    ? String(mcols[ci])
                    : fixedCategoryMapping.find((f) => f.colIndex === ci)
                        ?.name || `Col ${ci}`;
                let val = "";
                if (mrow && mrow.c && mrow.c[ci] && mrow.c[ci].v != null) {
                  val = parseRatingCell(mrow.c[ci]);
                }
                newCats.push({ name: headerName, value: val });
              }
              const overallCell =
                mrow &&
                mrow.c &&
                (mrow.c[11] || mrow.c[headerIndexMap["moyennegenerale"]])
                  ? mrow.c[11] || mrow.c[headerIndexMap["moyennegenerale"]]
                  : null;
              result.categories = [
                {
                  name: "Nom",
                  value:
                    scellVal(nameIdx) ||
                    (scells[0] && scells[0].v != null
                      ? String(scells[0].v)
                      : ""),
                },
                ...newCats,
              ];
              result.overall =
                overallCell && overallCell.v != null
                  ? parseRatingCell(overallCell)
                  : null;
              result.column = null;
            } else {
              // No per-respondent data found in matrice
              if (cfg.gidMatrice) {
                // Matrice exists but no per-respondent row match. Try to compute per-respondent category averages using sheet1 columns for this particular respondent row.
                try {
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
                    "🚐 Car navette": [
                      "Prestation du conducteur",
                      "Confort et propreté",
                    ],
                    "🏨 HÉBERGEMENT": [
                      "Accueil",
                      "Cadre des restaurants",
                      "Cadre et environnement",
                      "Propreté des parties communes",
                      "Qualité et variété des plats",
                    ],
                    "🛏️ CHAMBRES": [
                      "Propreté",
                      "Confort",
                      "Taille",
                      "Salle de bains",
                    ],
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

                  for (const [catName, titles] of Object.entries(
                    categoriesDef,
                  )) {
                    let sum = 0;
                    let count = 0;
                    // find columns matching any title
                    const colIndexes: number[] = [];
                    for (let hi = 0; hi < scols.length; hi++) {
                      const h = scols[hi] || "";
                      for (const t of titles) {
                        if (headerMatches(h, t)) {
                          colIndexes.push(hi);
                          break;
                        }
                      }
                    }
                    // Read values for this respondent row only
                    if (colIndexes.length > 0) {
                      for (const ci of colIndexes) {
                        const raw =
                          scells[ci] && scells[ci].v != null
                            ? scells[ci].v
                            : null;
                        const n = toNumber(raw);
                        if (n != null) {
                          sum += n;
                          count++;
                        }
                      }
                      if (count > 0) {
                        const avg = sum / count;
                        const normalized = normalizeAverage(avg);
                        newCats.push({
                          name: catName,
                          value:
                            normalized != null
                              ? String(Number(normalized.toFixed(2)))
                              : "",
                        });
                      } else {
                        newCats.push({ name: catName, value: "" });
                      }
                    } else {
                      newCats.push({ name: catName, value: "" });
                    }
                  }

                  result.categories = [
                    {
                      name: "Nom",
                      value:
                        scellVal(nameIdx) ||
                        (scells[0] && scells[0].v != null
                          ? String(scells[0].v)
                          : ""),
                    },
                    ...newCats,
                  ];
                  result.overall =
                    scells[11] && scells[11].v != null
                      ? String(scells[11].v)
                      : null;
                  result.column = null;
                } catch (eCalc) {
                  // on error, fallback to empty categories
                  for (let i = 1; i <= 10; i++) {
                    const name =
                      fixedCategoryMapping.find((f) => f.colIndex === i)
                        ?.name || `Col ${i}`;
                    newCats.push({ name, value: "" });
                  }
                  result.categories = [
                    {
                      name: "Nom",
                      value:
                        scellVal(nameIdx) ||
                        (scells[0] && scells[0].v != null
                          ? String(scells[0].v)
                          : ""),
                    },
                    ...newCats,
                  ];
                  result.overall = null;
                  result.column = null;
                }
              } else {
                // No matrice configured: fallback to sheet1 per-respondent values
                for (const m of fixedCategoryMapping) {
                  let val = "";
                  if (m.colIndex === 0) {
                    val =
                      scellVal(nameIdx) ||
                      (scells[0] && scells[0].v != null
                        ? String(scells[0].v)
                        : "");
                  } else if (m.colIndex === 11) {
                    val =
                      scells[11] && scells[11].v != null
                        ? String(scells[11].v)
                        : "";
                  } else {
                    val =
                      scells[m.colIndex] && scells[m.colIndex].v != null
                        ? String(scells[m.colIndex].v)
                        : "";
                  }
                  newCats.push({ name: m.name, value: val });
                }
                result.categories = newCats;
                result.overall =
                  scells[11] && scells[11].v != null
                    ? String(scells[11].v)
                    : null;
                result.column = null;
              }
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch matrice for overall:", e);
      }

      // Attach debug info when requested or if specific respondent (KIEHL) to aid debugging
      const qNameLower = (req.query.name || "").toString().trim().toLowerCase();
      if (req.query.debug === "1" || qNameLower === "kiehl") {
        try {
          const dbg: any = {};
          dbg.sheet1RowIdx =
            typeof sheet1RowIdx !== "undefined" ? sheet1RowIdx : null;
          dbg.scells =
            typeof scells !== "undefined" && scells
              ? (scells || []).map(cellToString).slice(0, 200)
              : null;
          dbg.respColIndex =
            typeof respColIndex !== "undefined" ? respColIndex : null;
          dbg.mcols =
            typeof mcols !== "undefined" ? (mcols || []).slice(0, 200) : null;
          dbg.mrowsLength =
            typeof mrows !== "undefined" ? (mrows || []).length : null;
          dbg.lastRowIndex =
            typeof mrows !== "undefined" &&
            typeof lastRow !== "undefined" &&
            lastRow
              ? Math.max(0, (mrows || []).indexOf(lastRow))
              : null;
          dbg.lastRowCells =
            typeof lastRowCells !== "undefined" && lastRowCells
              ? (lastRowCells || []).map(cellToString).slice(0, 200)
              : null;
          dbg.matchedMatriceRow =
            typeof matchedMatriceRow !== "undefined" && matchedMatriceRow
              ? (matchedMatriceRow.c || []).map(cellToString)
              : null;
          result._debug = dbg;
        } catch (ex) {
          console.error("Failed to build debug info:", ex);
        }
      }

      return res.status(200).json(result);
    }

    // If respondent not found in sheet1, fall back to previous matrice-first logic
    const gurl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${GID_MATRICE_MOYENNE}`;
    const rr = await fetch(gurl);
    if (!rr.ok) {
      if (isDebug)
        return res
          .status(502)
          .json({
            error: "Unable to fetch matrice",
            _debug: { gurl, status: rr.status },
          });
      return res.status(502).json({ error: "Unable to fetch matrice" });
    }
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
      // extract exact feedback column value if present (use detected feedbackColIdx or fallback to BT)
      let feedbackCell: any = null;
      if (typeof feedbackColIdx !== "undefined" && feedbackColIdx !== -1 && cells[feedbackColIdx] && cells[feedbackColIdx].v != null)
        feedbackCell = cells[feedbackColIdx];
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
      // get feedback from detected feedback column index (in last row) or fallback to BT (index 71)
      let feedbackCell: any = null;
      if (
        typeof feedbackColIdx !== "undefined" &&
        feedbackColIdx !== -1 &&
        lastRow &&
        lastRow.c &&
        lastRow.c[feedbackColIdx] &&
        lastRow.c[feedbackColIdx].v != null
      )
        feedbackCell = lastRow.c[feedbackColIdx];
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
          // extract exact feedback column value if present (use detected feedbackColIdx or fallback to BT)
          let feedbackCell: any = null;
          if (typeof feedbackColIdx !== "undefined" && feedbackColIdx !== -1 && cells[feedbackColIdx] && cells[feedbackColIdx].v != null)
            feedbackCell = cells[feedbackColIdx];
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

    if (isDebug)
      return res
        .status(404)
        .json({
          error: "Respondent not found in matrice",
          _debug: {
            sheet1RowIdx:
              typeof sheet1RowIdx !== "undefined" ? sheet1RowIdx : null,
          },
        });
    return res.status(404).json({ error: "Respondent not found in matrice" });
  } catch (err) {
    console.error("Failed to fetch respondent details:", err);
    return res.status(500).json({ error: "Unable to load respondent details" });
  }
};
