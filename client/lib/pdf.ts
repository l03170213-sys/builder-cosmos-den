import jsPDF from "jspdf";
import { fetchJsonSafe } from "@/lib/fetcher";

function pause(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function sanitizeText(s: any) {
  if (s == null) return "";
  try {
    let str = String(s).normalize('NFKC');
    // remove invisible/control/other characters
    str = str.replace(/\p{C}/gu, '');
    // collapse multiple whitespace
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
  if (meta?.date) metaParts.push(`Date: ${sanitizeText(meta.date)}`);
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

  for (let i = 0; i < total; i++) {
    const r = allRespondents[i];
    // fetch details for each respondent — do sequentially to avoid rate limits
    try {
      const params = new URLSearchParams();
      if (r.email) params.set("email", r.email);
      if (r.name) params.set("name", r.name);
      if (r.date) params.set("date", r.date);
      const url = `/api/resort/${resortKey}/respondent?${params.toString()}`;
      const details = await fetchJsonSafe(url, { credentials: "same-origin" }).catch(() => null);
      addRespondentPage(doc, i, total, r.name || r.label || r.email || `Respondent ${i + 1}`, details?.overall || r.note || "", details?.feedback || r.feedback || "", (details && details.categories) || null);
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
