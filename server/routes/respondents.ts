import { RESORTS } from "../resorts";

function parseGviz(text: string) {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  const json = text.slice(start + 1, end);
  return JSON.parse(json);
}

function cellToString(c: any) {
  if (!c) return "";
  if (typeof c === "string") return c;
  if (typeof c === "number") return String(c);
  if (c && typeof c === "object" && c.v != null) return String(c.v);
  return "";
}

function tryParseDate(s: string): Date | null {
  if (!s) return null;
  let str = String(s).trim();
  // Normalize NBSP and multiple spaces
  str = str
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Google Sheets Date(YYYY,M,D,...)
  const sheetsDate = str.match(
    /^Date\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})/,
  );
  if (sheetsDate) {
    const y = Number(sheetsDate[1]);
    const m = Number(sheetsDate[2]);
    const d = Number(sheetsDate[3]);
    // month in this representation may be 0-based; attempt both by creating date and checking
    const dt = new Date(y, m, d);
    if (!isNaN(dt.getTime()))
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }

  // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  const dmY = str.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
  if (dmY) {
    let day = Number(dmY[1]);
    let month = Number(dmY[2]) - 1;
    let year = Number(dmY[3]);
    if (String(year).length === 2) year = 2000 + year;
    const dt = new Date(year, month, day);
    if (!isNaN(dt.getTime()))
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }

  // ISO 2025-07-09T... or 2025-07-09
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]) - 1;
    const d = Number(iso[3]);
    const dt = new Date(y, m, d);
    if (!isNaN(dt.getTime()))
      return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  }

  // Try numeric Excel serial (days since 1899-12-30)
  const num = Number(str);
  if (!Number.isNaN(num) && num > 0) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const dt = new Date(
      excelEpoch.getTime() + Math.round(num) * 24 * 60 * 60 * 1000,
    );
    return new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
  }

  // Last resort: Date constructor
  const dt = new Date(str);
  if (!isNaN(dt.getTime()))
    return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  return null;
}

export const getResortRespondents: RequestHandler = async (req, res) => {
  try {
    const resortKey = req.params.resort as string;
    const cfg = RESORTS[resortKey];
    if (!cfg) return res.status(404).json({ error: "Unknown resort" });

    const SHEET_ID = cfg.sheetId;

    const gurl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq`;
    const rr = await fetch(gurl);
    if (!rr.ok) return res.status(502).json({ error: "Unable to fetch sheet" });
    const text = await rr.text();
    const json = parseGviz(text);
    const cols: string[] = (json.table.cols || []).map((c: any) =>
      (c.label || "").toString(),
    );
    const rows: any[] = (json.table.rows || []) as any[];

    // Determine columns
    const findCol = (keywords: string[]) => {
      const lower = cols.map((c) => (c || "").toString().toLowerCase());
      for (let k of keywords) {
        for (let i = 0; i < lower.length; i++) {
          if (lower[i].includes(k)) return i;
        }
      }
      return -1;
    };

    const normalizeHeader = (s: string) =>
      (s || "")
        .toString()
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    const TARGET_FEEDBACK_TITLE = "Votre avis compte pour nous ! :)";
    const feedbackColExact = cols.findIndex(
      (c) => normalizeHeader(c) === normalizeHeader(TARGET_FEEDBACK_TITLE),
    );

    const emailCol = findCol(["email", "courriel", "@"]);
    const noteCol = findCol([
      "note",
      "moyenne",
      "overall",
      "note général",
      "note generale",
      "note générale",
    ]);
    // Use column C (index 2) as the date column for all resorts per request
    const dateCol = 2;
    // Agency per user request is column H (index 7)
    const agencyCol = 7;
    // Per request, age should be read from column BK (zero-based index 62)
    const ageCol = 62;
    const postalCol = findCol(["postal", "code postal", "postcode", "zip"]);
    const durationCol = findCol([
      "durée",
      "duree",
      "duration",
      "séjour",
      "sejour",
    ]);
    const feedbackCol = findCol([
      "comment",
      "commentaire",
      "feedback",
      "remarque",
      "votre avis",
      "votre avis compte",
      "votre avis compte pour nous",
      "votre avis compte pour nous ! :)",
    ]);

    // Fallbacks: if noteCol not found, try column 11 (L)
    let resolvedNoteCol = noteCol;
    if (resolvedNoteCol === -1 && cols.length > 11) resolvedNoteCol = 11;

    const nameCol =
      findCol(["nom", "name", "client", "label"]) !== -1
        ? findCol(["nom", "name", "client", "label"])
        : cols.length > 4
          ? 4
          : 0;
    const resolvedEmailCol =
      emailCol !== -1 ? emailCol : cols.length > 3 ? 3 : -1;
    const resolvedPostalCol =
      postalCol !== -1 ? postalCol : cols.length > 8 ? 8 : -1;

    const respondents: any[] = [];
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const c = row.c || [];
      const hasAny = (c || []).some(
        (cell: any) =>
          cell && cell.v != null && String(cell.v).toString().trim() !== "",
      );
      if (!hasAny) continue;

      const obj: any = {};
      obj.id = r + 1;
      obj.label = cellToString(c[nameCol]);
      obj.email =
        resolvedEmailCol !== -1
          ? cellToString(c[resolvedEmailCol])
          : cellToString(c[3]);
      obj.note = "";
      obj.date = dateCol !== -1 ? cellToString(c[dateCol]) : "";
      obj.age = ageCol !== -1 ? cellToString(c[ageCol]) : "";
      obj.postal =
        resolvedPostalCol !== -1
          ? cellToString(c[resolvedPostalCol])
          : cellToString(c[8]);
      obj.duration = durationCol !== -1 ? cellToString(c[durationCol]) : "";
      obj.agency = agencyCol !== -1 ? cellToString(c[agencyCol]) : "";

      if (feedbackColExact !== -1) {
        obj.feedback = cellToString(c[feedbackColExact]);
      } else if (c[71] && c[71].v != null) {
        obj.feedback = cellToString(c[71]);
      } else if (feedbackCol !== -1) {
        obj.feedback = cellToString(c[feedbackCol]);
      } else {
        obj.feedback = "";
      }

      if (!obj.email && obj.label && obj.label.includes("@"))
        obj.email = obj.label;
      obj.name = obj.label;
      respondents.push(obj);
    }

    // Try to enrich respondents with overall note from matrice sheet
    try {
      if (cfg.gidMatrice) {
        const mgurl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${cfg.gidMatrice}`;
        const mr = await fetch(mgurl);
        if (mr.ok) {
          const mtext = await mr.text();
          const mjson = parseGviz(mtext);
          const mcols: string[] = (mjson.table.cols || []).map((c: any) =>
            (c.label || "").toString(),
          );
          const mrows: any[] = mjson.table.rows || [];

          for (let ridx = 0; ridx < respondents.length; ridx++) {
            const resp = respondents[ridx];
            const eKey = (resp.email || "").toString().trim().toLowerCase();
            const lKey = (resp.label || "").toString().trim().toLowerCase();
            if (!eKey && !lKey) continue;
            let matched = false;
            for (let ri = 0; ri < mrows.length; ri++) {
              const cells = (mrows[ri].c || []) as any[];
              const normCells = cells.map((cell: any) =>
                (cellToString(cell) || "").toString().trim().toLowerCase(),
              );

              if (lKey) {
                const firstCell = (cellToString(cells[0]) || "")
                  .toString()
                  .trim()
                  .toLowerCase();
                if (
                  firstCell &&
                  (firstCell === lKey ||
                    firstCell.includes(lKey) ||
                    lKey.includes(firstCell))
                ) {
                  const overallIdx =
                    11 < cells.length ? 11 : Math.max(0, cells.length - 1);
                  const overallCell = cells[overallIdx];
                  if (overallCell && overallCell.v != null)
                    respondents[ridx].note = String(overallCell.v);
                  matched = true;
                  break;
                }
              }

              if (eKey) {
                for (const txt of normCells) {
                  if (!txt) continue;
                  if (txt === eKey) {
                    const overallIdx =
                      11 < cells.length ? 11 : Math.max(0, cells.length - 1);
                    const overallCell = cells[overallIdx];
                    if (overallCell && overallCell.v != null)
                      respondents[ridx].note = String(overallCell.v);
                    matched = true;
                    break;
                  }
                }
                if (matched) break;
              }

              if (eKey) {
                for (const txt of normCells) {
                  if (!txt) continue;
                  if (txt.includes(eKey) || eKey.includes(txt)) {
                    const overallIdx =
                      11 < cells.length ? 11 : Math.max(0, cells.length - 1);
                    const overallCell = cells[overallIdx];
                    if (overallCell && overallCell.v != null)
                      respondents[ridx].note = String(overallCell.v);
                    matched = true;
                    break;
                  }
                }
                if (matched) break;
              }

              if (lKey) {
                for (const txt of normCells) {
                  if (!txt) continue;
                  if (txt.includes(lKey) || lKey.includes(txt)) {
                    const overallIdx =
                      11 < cells.length ? 11 : Math.max(0, cells.length - 1);
                    const overallCell = cells[overallIdx];
                    if (overallCell && overallCell.v != null)
                      respondents[ridx].note = String(overallCell.v);
                    matched = true;
                    break;
                  }
                }
                if (matched) break;
              }
            }
          }

          const colLabelLower = mcols.map((c) =>
            (c || "").toString().trim().toLowerCase(),
          );
          const byEmail: Record<string, number[]> = {};
          const byLabel: Record<string, number[]> = {};
          respondents.forEach((resp, idx) => {
            const e = (resp.email || "").toString().trim().toLowerCase();
            const l = (resp.label || "").toString().trim().toLowerCase();
            if (e) {
              byEmail[e] = byEmail[e] || [];
              byEmail[e].push(idx);
            }
            if (l) {
              byLabel[l] = byLabel[l] || [];
              byLabel[l].push(idx);
            }
          });

          for (let ci = 0; ci < colLabelLower.length; ci++) {
            const lbl = colLabelLower[ci];
            if (!lbl) continue;
            if (byEmail[lbl]) {
              for (const ridx of byEmail[lbl]) {
                if (respondents[ridx].note && respondents[ridx].note !== "")
                  continue;
                const lastRow = mrows[mrows.length - 1];
                const overallCell = lastRow && lastRow.c && lastRow.c[ci];
                if (overallCell && overallCell.v != null)
                  respondents[ridx].note = String(overallCell.v);
              }
              continue;
            }
            if (byLabel[lbl]) {
              for (const ridx of byLabel[lbl]) {
                if (respondents[ridx].note && respondents[ridx].note !== "")
                  continue;
                const lastRow = mrows[mrows.length - 1];
                const overallCell = lastRow && lastRow.c && lastRow.c[ci];
                if (overallCell && overallCell.v != null)
                  respondents[ridx].note = String(overallCell.v);
              }
              continue;
            }
            for (const eKey of Object.keys(byEmail)) {
              if (lbl.includes(eKey) && eKey) {
                for (const ridx of byEmail[eKey]) {
                  if (respondents[ridx].note && respondents[ridx].note !== "")
                    continue;
                  const lastRow = mrows[mrows.length - 1];
                  const overallCell = lastRow && lastRow.c && lastRow.c[ci];
                  if (overallCell && overallCell.v != null)
                    respondents[ridx].note = String(overallCell.v);
                }
              }
            }
            for (const lKey of Object.keys(byLabel)) {
              if (lbl.includes(lKey) && lKey) {
                for (const ridx of byLabel[lKey]) {
                  if (respondents[ridx].note && respondents[ridx].note !== "")
                    continue;
                  const lastRow = mrows[mrows.length - 1];
                  const overallCell = lastRow && lastRow.c && lastRow.c[ci];
                  if (overallCell && overallCell.v != null)
                    respondents[ridx].note = String(overallCell.v);
                }
              }
            }
          }

          for (let i = 0; i < respondents.length; i++) {
            if (respondents[i].note && respondents[i].note !== "") continue;
            const mrow = mrows[i];
            if (!mrow) continue;
            const mcells = mrow.c || [];
            const overallIdx =
              11 < mcells.length ? 11 : Math.max(0, mcells.length - 1);
            const overallCell = mcells[overallIdx];
            if (overallCell && overallCell.v != null)
              respondents[i].note = String(overallCell.v);
          }
        }
      }
    } catch (e) {
      console.error("Failed to enrich respondents from matrice:", e);
    }

    // Apply filtering from query params (name, agency, startDate, endDate)
    try {
      const qName = (req.query.name || "").toString().trim().toLowerCase();
      const qAgency = (req.query.agency || "").toString().trim().toLowerCase();
      const qStart = (req.query.startDate || "").toString().trim();
      const qEnd = (req.query.endDate || "").toString().trim();
      const sortDate = (req.query.sortDate || "").toString().toLowerCase(); // 'asc' or 'desc'

      let filtered = respondents;

      if (qName) {
        filtered = filtered.filter((r) => {
          const name = (r.name || r.label || "").toString().toLowerCase();
          return name.includes(qName);
        });
      }

      if (qAgency) {
        filtered = filtered.filter((r) => {
          const agency = (r.agency || "").toString().toLowerCase();
          return agency.includes(qAgency);
        });
      }

      if (qStart || qEnd) {
        const start = qStart ? tryParseDate(qStart) : null;
        const end = qEnd ? tryParseDate(qEnd) : null;
        filtered = filtered.filter((r) => {
          const d = tryParseDate(r.date || "");
          if (!d) return false;
          if (start && d.getTime() < start.getTime()) return false;
          if (end && d.getTime() > end.getTime()) return false;
          return true;
        });
      }

      // Sort by date if requested
      if (sortDate === "asc" || sortDate === "desc") {
        filtered.sort((a, b) => {
          const da = tryParseDate(a.date || "");
          const db = tryParseDate(b.date || "");
          const ta = da ? da.getTime() : 0;
          const tb = db ? db.getTime() : 0;
          if (ta === tb) return 0;
          if (sortDate === "asc") return ta - tb;
          return tb - ta;
        });
      }

      // Support pagination via query params: page (1-based) and pageSize
      const page = Math.max(
        1,
        parseInt(String(req.query.page || "1"), 10) || 1,
      );
      const pageSize = Math.max(
        1,
        Math.min(500, parseInt(String(req.query.pageSize || "50"), 10) || 50),
      );
      const total = filtered.length;
      const startIdx = (page - 1) * pageSize;
      const endIdx = Math.min(total, startIdx + pageSize);
      const pageItems = filtered.slice(startIdx, endIdx);

      res.status(200).json({ items: pageItems, total, page, pageSize });
      return;
    } catch (e) {
      console.error("Failed to filter respondents:", e);
    }

    // Fallback: pagination without filtering
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const pageSize = Math.max(
      1,
      Math.min(500, parseInt(String(req.query.pageSize || "50"), 10) || 50),
    );
    const total = respondents.length;
    const start = (page - 1) * pageSize;
    const end = Math.min(total, start + pageSize);
    const pageItems = respondents.slice(start, end);

    res.status(200).json({ items: pageItems, total, page, pageSize });
  } catch (err) {
    console.error("Failed to fetch respondents:", err);
    res.status(500).json({ error: "Unable to load respondents" });
  }
};
