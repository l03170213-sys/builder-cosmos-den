import jsPDF from "jspdf";
import { fetchJsonSafe } from "@/lib/fetcher";

function pause(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function addRespondentPage(doc: any, idx: number, total: number, name: string, overall: string | null, feedback: string | null, categories: { name: string; value: string }[] | null) {
  if (idx > 0) doc.addPage();
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  doc.text(`${name || "Anonyme"}`, 20, 30);
  doc.setFontSize(12);
  doc.text(`Note générale: ${overall != null && overall !== "" ? overall : "—"}`, 20, 45);
  doc.setFontSize(11);
  doc.text("Avis du répondant:", 20, 60);
  const feedbackText = feedback || "(aucun)";
  // wrap text
  const split = doc.splitTextToSize(feedbackText, 170);
  doc.text(split, 20, 68);

  let y = 68 + split.length * 6 + 8;
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
      doc.text(`- ${c.name}: ${c.value}`, 24, y);
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
    addRespondentPage(doc, 0, 1, respondent.name || respondent.label || respondent.email || "Anonyme", details?.overall || respondent.note || "", details?.feedback || respondent.feedback || "", (details && details.categories) || null);
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
