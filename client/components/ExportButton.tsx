import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { RESORTS } from "@/lib/resorts";
import { safeFetch } from "@/lib/fetcher";

function makePage2Clone(original: HTMLElement) {
  // Create a clean container that mimics the example PDF layout
  const container = document.createElement("div");
  container.style.width = "794px"; // A4 portrait width approx at 96dpi
  container.style.minHeight = "1123px";
  container.style.padding = "48px";
  container.style.background = "white";
  container.style.boxSizing = "border-box";
  container.style.fontFamily = "Inter, Arial, Helvetica, sans-serif";
  container.style.color = "#0f172a";

  // Header like example
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";

  const left = document.createElement("div");
  try {
    const selectedKey =
      window.localStorage.getItem("selectedResort") || "vm-resort-albanie";
    const resorts = RESORTS;
    const cfg = resorts.find((r: any) => r.key === selectedKey) || resorts[0];
    left.innerHTML = `<h2 style="margin:0;font-size:20px;font-weight:700">${cfg.name}</h2><div style="margin-top:8px;color:#475569">Rapport de satisfaction</div>`;
  } catch (e) {
    left.innerHTML = `<h2 style="margin:0;font-size:20px;font-weight:700">VM Resort - Albanie</h2><div style="margin-top:8px;color:#475569">Rapport de satisfaction</div>`;
  }

  const right = document.createElement("div");
  right.innerHTML = `<div style="text-align:right;color:#94a3b8;font-size:12px">Generated: ${new Date().toLocaleDateString()}</div>`;

  header.appendChild(left);
  header.appendChild(right);
  container.appendChild(header);

  // Divider
  const hr = document.createElement("div");
  hr.style.height = "1px";
  hr.style.background = "#e6edf3";
  hr.style.margin = "20px 0";
  container.appendChild(hr);

  // Title for page 2
  const title = document.createElement("h3");
  title.textContent = "Notes par catégorie";
  title.style.margin = "0 0 12px 0";
  title.style.fontSize = "18px";
  title.style.fontWeight = "700";
  container.appendChild(title);

  // Clone the original list into the container
  const cloned = original.cloneNode(true) as HTMLElement;
  // Apply sizes
  cloned.style.width = "100%";
  cloned.style.marginTop = "8px";
  // Remove any animations
  cloned
    .querySelectorAll(".animate-pulse")
    .forEach((el) => (el.className = ""));

  container.appendChild(cloned);
  return container;
}

function makeSummaryClone(summaryEl: HTMLElement) {
  const container = document.createElement("div");
  container.style.width = "1123px"; // landscape A4 approx at 96dpi
  container.style.minHeight = "794px";
  container.style.padding = "48px";
  container.style.background = "white";
  container.style.boxSizing = "border-box";
  container.style.fontFamily = "Inter, Arial, Helvetica, sans-serif";
  container.style.color = "#0f172a";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";

  const left = document.createElement("div");
  try {
    const selectedKey =
      window.localStorage.getItem("selectedResort") || "vm-resort-albanie";
    const resorts = RESORTS;
    const cfg = resorts.find((r: any) => r.key === selectedKey) || resorts[0];
    left.innerHTML = `<h1 style="margin:0;font-size:22px;font-weight:800">${cfg.name}</h1><div style="margin-top:6px;color:#475569">Rapport de satisfaction</div>`;
  } catch (e) {
    left.innerHTML = `<h1 style="margin:0;font-size:22px;font-weight:800">VM Resort - Albanie</h1><div style="margin-top:6px;color:#475569">Rapport de satisfaction</div>`;
  }
  const right = document.createElement("div");
  right.innerHTML = `<div style="text-align:right;color:#94a3b8;font-size:12px">Generated: ${new Date().toLocaleDateString()}</div>`;
  header.appendChild(left);
  header.appendChild(right);
  container.appendChild(header);

  const hr = document.createElement("div");
  hr.style.height = "1px";
  hr.style.background = "#e6edf3";
  hr.style.margin = "16px 0 20px 0";
  container.appendChild(hr);

  // Insert the summary element
  const clonedSummary = summaryEl.cloneNode(true) as HTMLElement;
  clonedSummary.style.width = "100%";
  clonedSummary.style.marginTop = "8px";
  clonedSummary
    .querySelectorAll(".animate-pulse")
    .forEach((el) => (el.className = ""));
  container.appendChild(clonedSummary);

  return container;
}

export default async function exportToPdf(options: {
  chartId?: string;
  listId: string;
  summaryId?: string;
  filename?: string;
}) {
  const {
    chartId,
    listId,
    summaryId,
    filename = "vm-resort-report.pdf",
  } = options;
  const chartEl = chartId ? document.getElementById(chartId) : null;
  const listEl = document.getElementById(listId);
  if (!listEl) throw new Error("List element not found");

  // If summaryId provided -> official mode: build a single landscape page with summary + distribution + table
  if (summaryId) {
    const summaryEl = document.getElementById(summaryId);
    if (!summaryEl) throw new Error("Summary element not found");

    // build a landscape container that mirrors the sample
    const container = document.createElement("div");
    container.style.width = "1123px"; // landscape a4 approx at 96dpi
    container.style.minHeight = "794px";
    container.style.padding = "24px";
    container.style.background = "white";
    container.style.boxSizing = "border-box";
    container.style.fontFamily = "Inter, Arial, Helvetica, sans-serif";
    container.style.color = "#0f172a";

    // Use provided PDF as background image to ensure pixel-perfect layout
    const BG_URL =
      "https://cdn.builder.io/o/assets%2Fa55e2b675d8b4a19887bfba4c19f448e%2F8f063acd8d144a1c9fbdeeb239ed6649?alt=media&token=fb363196-8cf4-47b1-9cab-72e22aed133e&apiKey=a55e2b675d8b4a19887bfba4c19f448e";
    container.style.backgroundImage = `url("${BG_URL}")`;
    container.style.backgroundSize = "cover";
    container.style.backgroundPosition = "center";
    container.style.backgroundRepeat = "no-repeat";

    // Header row with three cards
    const cardsRow = document.createElement("div");
    cardsRow.style.display = "flex";
    cardsRow.style.gap = "16px";
    cardsRow.style.marginBottom = "18px";

    const makeCard = (title: string, valueHtml: string, subtitle?: string) => {
      const c = document.createElement("div");
      c.style.flex = "1";
      c.style.border = "1px solid #e6edf3";
      c.style.borderRadius = "8px";
      c.style.padding = "12px";
      c.style.background = "#fff";
      c.innerHTML = `<div style="font-size:12px;color:#64748b">${title}</div><div style="font-size:22px;font-weight:700;margin-top:6px">${valueHtml}</div>${subtitle ? `<div style="font-size:12px;color:#94a3b8;margin-top:6px">${subtitle}</div>` : ""}`;
      return c;
    };

    // fill cards from summaryEl content (be robust by selecting the grid and its direct children)
    let avg = "";
    let updated = "";
    let respondents = "";
    let respondentsSub = "";
    let rate = "";
    let rateSub = "";

    const grid = summaryEl.querySelector(".grid");
    if (grid && grid.children.length >= 1) {
      const cards = Array.from(grid.children).filter(
        (c) => c instanceof HTMLElement,
      ) as HTMLElement[];
      const readFromCard = (card: HTMLElement, idx: number) =>
        card.querySelectorAll("div")[idx]?.textContent?.trim() || "";
      if (cards[0]) {
        avg = readFromCard(cards[0], 1);
        updated = readFromCard(cards[0], 2);
      }
      if (cards[1]) {
        respondents = readFromCard(cards[1], 1);
        respondentsSub = readFromCard(cards[1], 2);
      }
      if (cards[2]) {
        rate = readFromCard(cards[2], 1);
        rateSub = readFromCard(cards[2], 2);
      }
    }

    cardsRow.appendChild(makeCard("Moyenne générale", avg, updated));
    cardsRow.appendChild(
      makeCard(
        "Nombre de réponses",
        respondents,
        respondentsSub || "Nombre de lignes (réponses)",
      ),
    );
    cardsRow.appendChild(makeCard("Taux de Recommandation", rate, rateSub));

    container.appendChild(cardsRow);

    // Section title
    const sectionTitle = document.createElement("h3");
    sectionTitle.textContent = "Répartition des Notes";
    sectionTitle.style.fontSize = "16px";
    sectionTitle.style.margin = "0 0 8px 0";
    sectionTitle.style.fontWeight = "700";
    container.appendChild(sectionTitle);

    // Insert the cloned distribution (listEl) full width
    const clonedList = listEl.cloneNode(true) as HTMLElement;
    clonedList.style.width = "100%";
    clonedList.style.display = "block";
    clonedList.style.verticalAlign = "top";
    clonedList
      .querySelectorAll(".animate-pulse")
      .forEach((el: any) => (el.className = ""));

    // Insert cloned distribution only (no detailed table)
    container.appendChild(clonedList);

    // render to canvas
    container.style.position = "fixed";
    container.style.left = "-9999px";
    document.body.appendChild(container);
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });
    document.body.removeChild(container);

    const final = new jsPDF({
      unit: "px",
      format: "a4",
      orientation: "landscape",
    });
    const img = canvas.toDataURL("image/png");

    // Fit to page while preserving aspect ratio and keeping margins
    const margin = 20;
    const pageW = final.internal.pageSize.getWidth();
    const pageH = final.internal.pageSize.getHeight();

    // create an image to read its natural size
    const imgEl = new Image();
    imgEl.src = img;
    await new Promise((res) => {
      imgEl.onload = res;
    });
    const imgW = imgEl.naturalWidth;
    const imgH = imgEl.naturalHeight;

    const availableW = pageW - margin * 2;
    const availableH = pageH - margin * 2;
    const scale = Math.min(availableW / imgW, availableH / imgH, 1);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;

    final.addImage(img, "PNG", x, y, drawW, drawH);
    final.save(filename);
    return;
  }

  // default behavior: include chart first
  if (!chartEl) throw new Error("Chart element not found");
  const chartCanvas = await html2canvas(chartEl, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });
  const page2 = makePage2Clone(listEl);
  page2.style.position = "fixed";
  page2.style.left = "-9999px";
  document.body.appendChild(page2);
  const listCanvas = await html2canvas(page2, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });
  document.body.removeChild(page2);

  const final = new jsPDF({
    unit: "px",
    format: "a4",
    orientation: "landscape",
  });

  // Helper to add an image and scale it to fit the current page
  const addScaledImage = async (pdf: any, dataUrl: string) => {
    const margin = 20;
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgEl = new Image();
    imgEl.src = dataUrl;
    await new Promise((res) => {
      imgEl.onload = res;
    });
    const imgW = imgEl.naturalWidth;
    const imgH = imgEl.naturalHeight;
    const availW = pageW - margin * 2;
    const availH = pageH - margin * 2;
    const scale = Math.min(availW / imgW, availH / imgH, 1);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const x = (pageW - drawW) / 2;
    const y = (pageH - drawH) / 2;
    pdf.addImage(dataUrl, "PNG", x, y, drawW, drawH);
  };

  const chartImgData = chartCanvas.toDataURL("image/png");
  await addScaledImage(final, chartImgData);

  final.addPage(
    [final.internal.pageSize.getHeight(), final.internal.pageSize.getWidth()],
    "portrait",
  );
  const listImgData = listCanvas.toDataURL("image/png");
  await addScaledImage(final, listImgData);

  final.save(filename);
}
