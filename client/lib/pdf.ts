import jsPDF from "jspdf";
import jsPDF from "jspdf";
import { fetchJsonSafe } from "@/lib/fetcher";
import { loadSettings } from "@/lib/settings";

function formatDateForPdf(raw: any) {
  if (!raw && raw !== 0) return null;
  let s = String(raw).toString().trim();
  // normalize control chars
  s = s.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();

  // Handle Google/Sheets Date(YYYY,M,D,...) format
  const sheetsDate = s.match(/^Date\(\s*(\d{4})\s*,\s*(\d{1,2})\s*,\s*(\d{1,2})/);
  if (sheetsDate) {
    const year = Number(sheetsDate[1]);
    const monthIndex = Number(sheetsDate[2]);
    const day = Number(sheetsDate[3]);
    const dt = new Date(year, monthIndex, day);
    const d = String(dt.getDate()).padStart(2, '0');
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // dd/mm/yyyy or dd.mm.yyyy or dd-mm-yyyy
  const dmY = s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/);
  if (dmY) {
    const d = dmY[1].padStart(2, '0');
    const m = dmY[2].padStart(2, '0');
    let y = dmY[3];
    if (y.length === 2) y = '20' + y;
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
    const d = String(dt.getDate()).padStart(2, '0');
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }

  // Excel serial number
  const num = Number(s);
  if (!Number.isNaN(num) && num > 0) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const dt2 = new Date(excelEpoch.getTime() + Math.round(num) * 24 * 60 * 60 * 1000);
    const d = String(dt2.getUTCDate()).padStart(2, '0');
    const m = String(dt2.getUTCMonth() + 1).padStart(2, '0');
    const y = dt2.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }

  return null;
}

function pause(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function sanitizeText(s: any) {
  if (s == null) return "";
  try {
    let str = String(s).normalize('NFKC');
    // always remove obvious invisible/control characters
    str = str.replace(/\p{C}/gu, '');

    const settings = typeof window !== 'undefined' ? loadSettings() : null;
    const removeGarbage = settings ? Boolean(settings.removeGarbageChars) : true;

    if (removeGarbage) {
      // Remove replacement character if present
      str = str.replace(/\uFFFD/g, '');

      // Remove specific problematic sequences provided by user (literal attempts)
      const unwantedSequences = [
        'Ø<ß\u001F',
        "'\u0008þ\u000F",
        'Ø=Þ•',
        'Ø<ßè',
        'Ø=ÞÏþ\u000F',
        'Ø<ßÊ',
        'Ø<ß‰',
        'Ø=Üe',
        'Ø>Ý\u001D',
        'Ø<ß',
      ];
      for (const seq of unwantedSequences) {
        str = str.split(seq).join('');
      }

      // Remove common spurious Latin-1 symbols that appear in the data
      str = str.replace(/[ØÞÝß×÷=•<>¤]/g, '');

      // Remove low-level control bytes that may remain
      str = str.replace(/[\x00-\x1F\x7F-\x9F]/g, '');

      // If there are leading non-letter/digit characters, strip them
      str = str.replace(/^[^\p{L}\p{N}]+/u, '');
    }

    // Collapse multiple whitespace
    str = str.replace(/\s+/g, ' ').trim();

    // Collapse digits separated by spaces (e.g. '2 . 5 4' => '2.54')
    str = str.replace(/(\d)\s+\.\s+(\d)/g, '$1.$2');
    str = str.replace(/(\d)\s+(\d)/g, '$1$2');

    // If string looks like letters separated by spaces (e.g. 'T R A N S P O R T S'), glue them
    const tokens = str.split(' ');
    const singleLetterCount = tokens.filter((t) => t.length === 1).length;
    if (tokens.length >= 4 && singleLetterCount / tokens.length > 0.5) {
      str = tokens.join('');
    }

    // Trim again
    str = str.replace(/\s+/g, ' ').trim();
    return str;
  } catch (e) {
    return String(s);
  }
}

function formatOverall(s: any) {
  if (s == null || s === '') return '—';
  const n = Number(String(s).toString().replace(',', '.'));
  if (Number.isNaN(n)) return sanitizeText(s);
  return n.toFixed(1).replace('.', ',');
}

function addRespondentPage(doc: any, idx: number, total: number, name: string, overall: string | null, feedback: string | null, categories: { name: string; value: string }[] | null, meta?: { date?: string | null; age?: string | null; postal?: string | null; duration?: string | null }) {
  if (idx > 0) doc.addPage();
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  doc.text(`${sanitizeText(name) || 'Anonyme'}`, 20, 30);

  // meta info line
  doc.setFontSize(11);
  const metaParts: string[] = [];
  if (meta?.date) {
    const formatted = formatDateForPdf(meta.date);
    metaParts.push(`Date: ${formatted != null ? formatted : sanitizeText(meta.date)}`);
  }
  if (meta?.age) metaParts.push(`Âge: ${sanitizeText(meta.age)}`);
  if (meta?.postal) metaParts.push(`Code postal: ${sanitizeText(meta.postal)}`);
  if (meta?.duration) metaParts.push(`Durée: ${sanitizeText(meta.duration)}`);
  if (metaParts.length) {
    doc.setFontSize(10);
    doc.text(metaParts.join(' — '), 20, 42);
  }

  doc.setFontSize(12);
  doc.text(`Note générale: ${formatOverall(overall)}`, 20, metaParts.length ? 55 : 45);
  doc.setFontSize(11);
  const feedbackText = sanitizeText(feedback) || '(aucun)';
  // wrap text
  const startFeedbackY = metaParts.length ? 70 : 60;
  doc.text('Avis du répondant:', 20, startFeedbackY);
  const split = doc.splitTextToSize(feedbackText, 170);
  doc.text(split, 20, startFeedbackY + 8);

  let y = startFeedbackY + 8 + split.length * 6 + 8;
  if (categories && categories.length) {
    doc.setFontSize(12);
    doc.text('Notes par catégorie:', 20, y);
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
  // wait for data to stabilize (per request)
  await pause(5000);
  // fetch details
  try {
    const params = new URLSearchParams();
    if (respondent.email) params.set("email", respondent.email);
    if (respondent.name) params.set("name", respondent.name);
    if (respondent.date) params.set("date", respondent.date);
    const url = `/api/resort/${resortKey}/respondent?${params.toString()}`;
    const details = await fetchJsonSafe(url, { credentials: "same-origin" }).catch(() => null);

    const doc = new jsPDF();
    addRespondentPage(
      doc,
      0,
      1,
      respondent.name || respondent.label || respondent.email || "Anonyme",
      details?.overall || respondent.note || "",
      details?.feedback || respondent.feedback || "",
      (details && details.categories) || null,
      { date: details?.date || respondent.date || null, age: details?.age || respondent.age || null, postal: details?.postal || respondent.postal || null, duration: details?.duration || respondent.duration || null }
    );
    doc.save(`respondent-${(respondent.name || respondent.email || "anon").replace(/[^a-z0-9_-]/gi, "_")}.pdf`);
  } catch (e) {
    throw e;
  }
}

export async function exportAllRespondentsPdf(resortKey: string, allRespondents: any[], onProgress?: (done: number, total: number) => void) {
  // wait 5s before starting
  await pause(5000);
  const doc = new jsPDF();
  let added = 0;
  const total = allRespondents.length;

  const perRespondentDelayMs = 700; // short delay between respondents to allow server to stabilize
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
      const url = `/api/resort/${resortKey}/respondent?${params.toString()}`;

      // try a couple of times if the server hasn't populated the details yet
      let details: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await pause(500 + attempt * 300);
        try {
          details = await fetchJsonSafe(url, { credentials: "same-origin" }).catch(() => null);
        } catch (e) {
          details = null;
        }
        if (details) break;
      }

      addRespondentPage(
        doc,
        i,
        total,
        r.name || r.label || r.email || `Respondent ${i + 1}`,
        details?.overall || r.note || "",
        details?.feedback || r.feedback || "",
        (details && details.categories) || null,
        { date: details?.date || r.date || null, age: details?.age || r.age || null, postal: details?.postal || r.postal || null, duration: details?.duration || r.duration || null }
      );
      added++;
      if (onProgress) onProgress(added, total);
    } catch (e) {
      // still continue
      addRespondentPage(doc, i, total, r.name || r.label || r.email || `Respondent ${i + 1}`, r.note || "", r.feedback || "", null);
      added++;
      if (onProgress) onProgress(added, total);
    }
  }

  doc.save(`respondents-all.pdf`);
}
