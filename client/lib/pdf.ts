import jsPDF from "jspdf";
import { fetchJsonSafe } from "@/lib/fetcher";
import { loadSettings } from "@/lib/settings";

function formatDateForPdf(raw: any) {
  if (!raw && raw !== 0) return null;
  let s = String(raw).toString().trim();
  // normalize control chars
  s = s
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Handle Google/Sheets Date(YYYY,M,D,...) format
  const sheetsDate = s.match(
    /^Date\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})/,
  );
  if (sheetsDate) {
    const year = Number(sheetsDate[1]);
    const monthIndex = Number(sheetsDate[2]);
    const day = Number(sheetsDate[3]);
    const dt = new Date(year, monthIndex, day);
    const d = String(dt.getDate()).padStart(2, "0");
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // dd/mm/yyyy or dd.mm.yyyy or dd-mm-yyyy
  const dmY = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
  if (dmY) {
    const d = dmY[1].padStart(2, "0");
    const m = dmY[2].padStart(2, "0");
    let y = dmY[3];
    if (y.length === 2) y = "20" + y;
    return `${d}/${m}/${y}`;
  }

  // ISO date YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }

  // Try JS Date parse
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    const d = String(dt.getDate()).padStart(2, "0");
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // Excel serial number
  const num = Number(s);
  if (!Number.isNaN(num) && num > 0) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const dt2 = new Date(
      excelEpoch.getTime() + Math.round(num) * 24 * 60 * 60 * 1000,
    );
    const d = String(dt2.getUTCDate()).padStart(2, "0");
    const m = String(dt2.getUTCMonth() + 1).padStart(2, "0");
    const y = dt2.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }

  return null;
}

function pause(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export function sanitizeText(s: any) {
  if (s == null) return "";
  try {
    let str = String(s).normalize("NFKC");
    // always remove obvious invisible/control characters
    str = str.replace(/\p{C}/gu, "");

    const settings = typeof window !== "undefined" ? loadSettings() : null;
    const removeGarbage = settings
      ? Boolean(settings.removeGarbageChars)
      : true;

    if (removeGarbage) {
      // Remove replacement character if present
      str = str.replace(/\uFFFD/g, "");

      // Remove specific problematic sequences provided by user (literal attempts)
      const unwantedSequences = [
        "Ø<ß\u001F",
        "'\u0008þ\u000F",
        "Ø=Þ•",
        "Ø<ßè",
        "Ø=ÞÏþ\u000F",
        "Ø<ßÊ",
        "Ø<ß‰",
        "��=Üe",
        "Ø>Ý\u001D",
        "Ø<ß",
      ];
      for (const seq of unwantedSequences) {
        str = str.split(seq).join("");
      }

      // Remove common spurious Latin-1 symbols that appear in the data
      str = str.replace(/[ØÞÝß×÷=•<>¤]/g, "");

      // Remove low-level control bytes that may remain
      str = str.replace(/[\x00-\x1F\x7F-\x9F]/g, "");

      // If there are leading non-letter/digit characters, strip them
      str = str.replace(/^[^\p{L}\p{N}]+/u, "");
    }

    // Collapse multiple whitespace
    str = str.replace(/\s+/g, " ").trim();

    // Collapse digits separated by spaces (e.g. '2 . 5 4' => '2.54')
    str = str.replace(/(\d)\s+\.\s+(\d)/g, "$1.$2");
    str = str.replace(/(\d)\s+(\d)/g, "$1$2");

    // If string looks like letters separated by spaces (e.g. 'T R A N S P O R T S'), glue them
    const tokens = str.split(" ");
    const singleLetterCount = tokens.filter((t) => t.length === 1).length;
    if (tokens.length >= 4 && singleLetterCount / tokens.length > 0.5) {
      str = tokens.join("");
    }

    // Trim again
    str = str.replace(/\s+/g, " ").trim();
    return str;
  } catch (e) {
    return String(s);
  }
}

function formatOverall(s: any) {
  if (s == null || s === "") return "—";
  const n = Number(String(s).toString().replace(",", "."));
  if (Number.isNaN(n)) return sanitizeText(s);
  return n.toFixed(1).replace(".", ",");
}

function addRespondentPage(
  doc: any,
  idx: number,
  total: number,
  name: string,
  overall: string | null,
  feedback: string | null,
  categories: { name: string; value: string }[] | null,
  meta?: {
    date?: string | null;
    age?: string | null;
    postal?: string | null;
    duration?: string | null;
    address?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  },
) {
  if (idx > 0) doc.addPage();
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  doc.text(`${sanitizeText(name) || "Anonyme"}`, 20, 30);

  // Address on next line if available
  let startY = 42;
  if (meta?.address) {
    doc.setFontSize(11);
    const addressText = sanitizeText(meta.address);
    doc.text(addressText, 20, startY);
    startY += 8;
  }

  // meta info line
  doc.setFontSize(11);
  const metaParts: string[] = [];

  // If a global period was passed via meta.startDate/meta.endDate, render it first
  if (meta?.startDate || meta?.endDate) {
    const s = meta.startDate ? formatDateForPdf(meta.startDate) : null;
    const e = meta.endDate ? formatDateForPdf(meta.endDate) : null;
    const parts: string[] = [];
    if (s) parts.push(s);
    if (e) parts.push(e);
    if (parts.length) {
      metaParts.push(`Période: ${parts.join(" — ")}`);
    }
  }

  if (meta?.date) {
    const formatted = formatDateForPdf(meta.date);
    metaParts.push(
      `Date: ${formatted != null ? formatted : sanitizeText(meta.date)}`,
    );
  }
  if (meta?.age) metaParts.push(`Âge: ${sanitizeText(meta.age)}`);
  if (meta?.postal) metaParts.push(`Code postal: ${sanitizeText(meta.postal)}`);
  if (meta?.duration) metaParts.push(`Durée: ${sanitizeText(meta.duration)}`);
  if (metaParts.length) {
    doc.setFontSize(10);
    doc.text(metaParts.join(" — "), 20, startY);
    startY += 8;
  }

  doc.setFontSize(12);
  doc.text(
    `Note générale: ${formatOverall(overall)}`,
    20,
    startY + 8,
  );
  doc.setFontSize(11);
  const feedbackText = sanitizeText(feedback) || "(aucun)";
  // wrap text
  const startFeedbackY = startY + 22;
  doc.text("Avis du répondant:", 20, startFeedbackY);
  const split = doc.splitTextToSize(feedbackText, 170);
  doc.text(split, 20, startFeedbackY + 8);

  let y = startFeedbackY + 8 + split.length * 6 + 8;
  if (categories && categories.length) {
    doc.setFontSize(12);
    doc.text("Notes par catégorie:", 20, y);
    y += 8;
    doc.setFontSize(10);
    for (const c of categories) {
      if (y > 270) {
        doc.addPage();
        y = 30;
      }
      const nameSan = sanitizeText(c.name);
      const valSan = formatOverall(c.value);
      doc.text(`- ${nameSan}: ${valSan}`, 24, y);
      y += 7;
    }
  }
}

export async function exportRespondentPdf(resortKey: string, respondent: any) {
  const settings = typeof window !== "undefined" ? loadSettings() : null;
  const initialDelayMs = settings
    ? (settings.pdfExportDelaySeconds || 1) * 1000
    : 1000;
  const maxAttempts = settings
    ? Math.max(1, settings.pdfExportRetries || 3)
    : 3;

  // wait for data to stabilize (per settings)
  await pause(initialDelayMs);
  // fetch details with retries
  try {
    const params = new URLSearchParams();
    if (respondent.email) params.set("email", respondent.email);
    if (respondent.name) params.set("name", respondent.name);
    if (respondent.date) params.set("date", respondent.date);
    // prefer exact row lookup when available
    if ((respondent as any).id)
      params.set("row", String((respondent as any).id));
    const url = `/api/resort/${resortKey}/respondent?${params.toString()}`;

    let details: any = null;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) await pause(500 + attempt * 300);
      try {
        details = await fetchJsonSafe(url, {
          credentials: "same-origin",
        }).catch(() => null);
      } catch (e) {
        details = null;
      }
      if (details) break;
    }

    const doc = new jsPDF();
    addRespondentPage(
      doc,
      0,
      1,
      respondent.name || respondent.label || respondent.email || "Anonyme",
      details?.overall || respondent.note || "",
      details?.feedback || respondent.feedback || "",
      (details && details.categories) || null,
      {
        date: details?.date || respondent.date || null,
        age: details?.age || respondent.age || null,
        postal: details?.postal || respondent.postal || null,
        duration: details?.duration || respondent.duration || null,
        address: details?.address || respondent.address || null,
      },
    );
    doc.save(
      `respondent-${(respondent.name || respondent.email || "anon").replace(/[^a-z0-9_-]/gi, "_")}.pdf`,
    );
  } catch (e) {
    throw e;
  }
}

export async function exportAllRespondentsPdf(
  resortKey: string,
  allRespondents: any[],
  optionsOrOnProgress?: any,
  maybeOnProgress?: (done: number, total: number) => void,
) {
  // Backwards compatible signature: (resortKey, all, onProgress) or (resortKey, all, options, onProgress)
  let options: any = {};
  let onProgress: ((done: number, total: number) => void) | undefined;
  if (typeof optionsOrOnProgress === "function") {
    onProgress = optionsOrOnProgress;
  } else if (optionsOrOnProgress) {
    options = optionsOrOnProgress;
    if (typeof maybeOnProgress === "function") onProgress = maybeOnProgress;
  }

  const settings = typeof window !== "undefined" ? loadSettings() : null;
  const initialDelayMs = settings
    ? (settings.pdfExportDelaySeconds || 1) * 1000
    : 1000;
  await pause(initialDelayMs);
  const doc = new jsPDF();
  let added = 0;
  const total = allRespondents.length;

  // If options.overallAverage provided, add a summary first page
  if (options && (options.overallAverage != null || options.title)) {
    // First page: summary
    doc.setFontSize(20);
    doc.setTextColor(20, 20, 20);
    doc.text(options.title || "Résumé des répondants", 20, 40);
    doc.setFontSize(36);
    doc.setTextColor(10, 10, 10);
    // If provided, render note moyenne under the title
    if (options.overallAverage != null) {
      const overallVal =
        typeof options.overallAverage === "number"
          ? String(options.overallAverage.toFixed(1)).replace(".", ",")
          : String(options.overallAverage);
      doc.setFontSize(18);
      doc.text(`Note moyenne: ${overallVal}`, 20, 80);
    }
    if (options.count != null) {
      doc.setFontSize(12);
      doc.text(`Nombre de répondants: ${String(options.count)}`, 20, 100);
    }

    // If category averages are provided, print them under the overall average
    if (
      options.categoryAverages &&
      Array.isArray(options.categoryAverages) &&
      options.categoryAverages.length
    ) {
      doc.setFontSize(12);
      doc.text("Moyennes par catégorie:", 20, 120);
      // Render as three columns with wrapping for long names
      const cols = 3;
      const pageWidthUsable = 210 - 40; // A4 width minus 20px margins
      const gutter = 8;
      const colWidth = Math.floor(
        (pageWidthUsable - (cols - 1) * gutter) / cols,
      );
      const startY = 132;
      const lineHeight = 7;

      // Normalize and sort categories: put 'APPRÉCIATION GLOBALE' first, 'MOYENNE GÉNÉRALE' last, else alphabetical
      const items = options.categoryAverages
        .map((c: any) => ({
          name: sanitizeText(c.name || ""),
          average: c.average,
          count: c.count || 0,
        }))
        .sort((a: any, b: any) => {
          const ka = (a.name || "").toString().toLowerCase();
          const kb = (b.name || "").toString().toLowerCase();
          if (
            ka.includes("appréciation globale") ||
            ka.includes("appreciation globale") ||
            ka === "appréciation globale"
          )
            return -1;
          if (
            kb.includes("appréciation globale") ||
            kb.includes("appreciation globale") ||
            kb === "appréciation globale"
          )
            return 1;
          if (
            ka.includes("moyenne générale") ||
            ka.includes("moyenne generale") ||
            ka === "moyenne générale"
          )
            return 1;
          if (
            kb.includes("moyenne générale") ||
            kb.includes("moyenne generale") ||
            kb === "moyenne générale"
          )
            return -1;
          return ka < kb ? -1 : ka > kb ? 1 : 0;
        });
      const itemsPerCol = Math.ceil(items.length / cols);

      for (let col = 0; col < cols; col++) {
        const x = 20 + col * (colWidth + gutter);
        let y = startY;
        const start = col * itemsPerCol;
        const end = Math.min(items.length, start + itemsPerCol);
        for (let i = start; i < end; i++) {
          const it = items[i];
          const avgText =
            it.average != null
              ? String(it.average.toFixed(1)).replace(".", ",")
              : "—";
          const text = `${it.name}: ${avgText}`;
          // split into lines that fit column width
          const lines = doc.splitTextToSize(text, colWidth);
          for (const line of lines) {
            if (y > 270) {
              // overflow - move to next page and continue there
              doc.addPage();
              doc.setFontSize(12);
              // re-render heading on new page for context
              doc.text(options.title || "Résumé des répondants", 20, 30);
              doc.text("Moyennes par catégorie (suite):", 20, 44);
              y = 56;
            }
            doc.text(line, x, y);
            y += lineHeight;
          }
          // small extra gap between categories
          y += 2;
        }
      }
    }
  }

  const perRespondentDelayMs = settings
    ? (settings.pdfExportDelaySeconds || 1) * 1000
    : 700; // short delay between respondents to allow server to stabilize
  const maxAttempts = settings
    ? Math.max(1, settings.pdfExportRetries || 3)
    : 3;
  for (let i = 0; i < total; i++) {
    const r = allRespondents[i];
    // small delay before processing each respondent
    await pause(perRespondentDelayMs);
    // fetch details for each respondent — do sequentially to avoid rate limits
    try {
      const params = new URLSearchParams();
      if (r.email) params.set("email", r.email);
      if (r.name) params.set("name", r.name);
      if (r.date) params.set("date", r.date);
      // prefer exact row lookup when available
      if ((r as any).id) params.set("row", String((r as any).id));
      const url = `/api/resort/${resortKey}/respondent?${params.toString()}`;

      // try a number of times if the server hasn't populated the details yet
      let details: any = null;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) await pause(500 + attempt * 300);
        try {
          details = await fetchJsonSafe(url, {
            credentials: "same-origin",
          }).catch(() => null);
        } catch (e) {
          details = null;
        }
        if (details) break;
      }

      // If we added a summary page, shift respondent pages by +1 to avoid overwriting
      const pageIdx =
        options && (options.overallAverage != null || options.title)
          ? i + 1
          : i;

      addRespondentPage(
        doc,
        pageIdx,
        total,
        r.name || r.label || r.email || `Respondent ${i + 1}`,
        details?.overall || r.note || "",
        details?.feedback || r.feedback || "",
        (details && details.categories) || null,
        {
          // per-respondent meta
          date: details?.date || r.date || null,
          age: details?.age || r.age || null,
          postal: details?.postal || r.postal || null,
          duration: details?.duration || r.duration || null,
          // global period from options if present
          startDate: options && options.startDate ? options.startDate : null,
          endDate: options && options.endDate ? options.endDate : null,
        },
      );
      added++;
      if (onProgress) onProgress(added, total);
    } catch (e) {
      // still continue
      const pageIdx =
        options && (options.overallAverage != null || options.title)
          ? i + 1
          : i;
      addRespondentPage(
        doc,
        pageIdx,
        total,
        r.name || r.label || r.email || `Respondent ${i + 1}`,
        r.note || "",
        r.feedback || "",
        null,
        {
          startDate: options && options.startDate ? options.startDate : null,
          endDate: options && options.endDate ? options.endDate : null,
        },
      );
      added++;
      if (onProgress) onProgress(added, total);
    }
  }

  const filename =
    options && options.filename ? options.filename : `respondents-all.pdf`;
  doc.save(filename);
}

export async function exportAgencyCategoryAveragesPdf(
  resortKey: string,
  agencyName: string,
  categoryAverages: { name: string; average: number | null; count: number }[],
  options?: {
    filename?: string;
    title?: string;
    overallAverage?: number | string;
    startDate?: string | null;
    endDate?: string | null;
  },
) {
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.setTextColor(20, 20, 20);
  doc.text(options?.title || `Moyennes par catégorie`, 20, 30);
  doc.setFontSize(12);
  doc.text(`Hôtel: ${resortKey}`, 20, 46);
  doc.text(`Agence: ${agencyName}`, 20, 56);
  let y = 76;

  // If a date range was provided in options, render it under the agency line
  if (options && (options.startDate || options.endDate)) {
    const start = options.startDate
      ? formatDateForPdf(options.startDate)
      : null;
    const end = options.endDate ? formatDateForPdf(options.endDate) : null;
    const parts: string[] = [];
    if (start) parts.push(start);
    if (end) parts.push(end);
    if (parts.length) {
      doc.setFontSize(11);
      doc.text(`Période: ${parts.join(" — ")}`, 20, 66);
      y = 80;
    }
  }

  // If an overall average was provided, render it under the period (or under agency if no period)
  if (options && options.overallAverage != null) {
    const overallVal =
      typeof options.overallAverage === "number"
        ? String(options.overallAverage.toFixed(1)).replace(".", ",")
        : String(options.overallAverage);
    doc.setFontSize(12);
    doc.text(`Note moyenne: ${overallVal}`, 20, y);
    y += 12;
  }
  doc.setFontSize(12);
  // Sort categories with same rules as summary: appreciation global first, moyenne generale last, otherwise alphabetical
  const sortedCats = (categoryAverages || [])
    .map((c) => ({ ...c, name: sanitizeText(c.name || "") }))
    .sort((a, b) => {
      const ka = (a.name || "").toString().toLowerCase();
      const kb = (b.name || "").toString().toLowerCase();
      if (
        ka.includes("appréciation globale") ||
        ka.includes("appreciation globale") ||
        ka === "appréciation globale"
      )
        return -1;
      if (
        kb.includes("appréciation globale") ||
        kb.includes("appreciation globale") ||
        kb === "appréciation globale"
      )
        return 1;
      if (
        ka.includes("moyenne générale") ||
        ka.includes("moyenne generale") ||
        ka === "moyenne générale"
      )
        return 1;
      if (
        kb.includes("moyenne générale") ||
        kb.includes("moyenne generale") ||
        kb === "moyenne générale"
      )
        return -1;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

  for (const c of sortedCats) {
    if (y > 270) {
      doc.addPage();
      y = 30;
    }
    const nameSan = c.name;
    const avg =
      c.average != null ? String(c.average.toFixed(1)).replace(".", ",") : "—";
    doc.text(`- ${nameSan}: ${avg}`, 20, y);
    y += 10;
  }
  const filename =
    options?.filename ||
    `moyennes-agence-${(agencyName || "all").replace(/[^a-z0-9_\-]/gi, "_")}.pdf`;
  doc.save(filename);
}
