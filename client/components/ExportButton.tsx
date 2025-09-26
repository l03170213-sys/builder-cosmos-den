import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { getResorts } from "@/lib/resorts";
import { safeFetch } from "@/lib/fetcher";
import { loadSettings } from "@/lib/settings";

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
    const resorts = getResorts();
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
    const resorts = getResorts();
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
  preCaptureMs?: number;
  canvasScale?: number;
}) {
  const settings = loadSettings();
  const {
    chartId,
    listId,
    summaryId,
    filename = "vm-resort-report.pdf",
    preCaptureMs = settings.exportPreCaptureMs,
    canvasScale = settings.exportCanvasScale,
  } = options as any;
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

  // default behavior: include chart first (with hotel name header)
  if (!chartEl) throw new Error("Chart element not found");

  // Build a temporary container that includes the hotel name above the chart
  const chartContainer = document.createElement("div");
  chartContainer.style.width = "794px"; // portrait width approx
  chartContainer.style.minHeight = "500px";
  chartContainer.style.padding = "24px";
  chartContainer.style.background = "white";
  chartContainer.style.boxSizing = "border-box";
  chartContainer.style.fontFamily = "Inter, Arial, Helvetica, sans-serif";
  chartContainer.style.color = "#0f172a";

  // hotel name header
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.marginBottom = "12px";
  try {
    const selectedKey =
      window.localStorage.getItem("selectedResort") || "vm-resort-albanie";
    const resorts = getResorts();
    const cfg = resorts.find((r: any) => r.key === selectedKey) || resorts[0];
    header.innerHTML = `<div style="font-size:18px;font-weight:700">${cfg.name}</div>`;
  } catch (e) {
    header.innerHTML = `<div style="font-size:18px;font-weight:700">VM Resort</div>`;
  }
  chartContainer.appendChild(header);

  // Clone chart element into container
  const clonedChart = chartEl.cloneNode(true) as HTMLElement;
  clonedChart.style.width = "100%";
  clonedChart.style.height = "auto";
  // Remove potential animations
  clonedChart
    .querySelectorAll?.(".animate-pulse")
    .forEach((el: any) => (el.className = ""));
  chartContainer.appendChild(clonedChart);

  // render the chartContainer to canvas
  chartContainer.style.position = "fixed";
  chartContainer.style.left = "-9999px";
  document.body.appendChild(chartContainer);
  const chartCanvas = await html2canvas(chartContainer, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });
  document.body.removeChild(chartContainer);

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

function sanitizeFilename(name: string) {
  return name
    .replace(/[^\n\w\d\-_. ]+/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();
}

export async function exportAllHotels(options?: { mode?: "both" | "graphics" | "official"; delayMs?: number; timeoutMs?: number; canvasScale?: number; preCaptureMs?: number; onProgress?: (done:number,total:number,key?:string)=>void }) {
  const settings = loadSettings();
  const { mode = "both", delayMs = settings.pdfExportDelaySeconds * 1000, timeoutMs = 8000, canvasScale = settings.exportCanvasScale, preCaptureMs = settings.exportPreCaptureMs, onProgress } = options || {} as any;
  const resorts = getResorts();
  const original = typeof window !== "undefined" ? window.localStorage.getItem("selectedResort") || (resorts[0] && resorts[0].key) : null;

  const waitForElement = async (id: string, timeout = timeoutMs) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = document.getElementById(id);
      if (el) return el;
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  };

  // Prepare a single PDF document for all resorts
  const final = new jsPDF({ unit: "px", format: "a4", orientation: "landscape" });
  let isFirstPage = true;

  const addScaledImage = async (pdf: any, dataUrl: string, orientation: "landscape" | "portrait" = "landscape") => {
    const margin = 20;
    const pageW = orientation === "landscape" ? pdf.internal.pageSize.getWidth() : pdf.internal.pageSize.getHeight();
    const pageH = orientation === "landscape" ? pdf.internal.pageSize.getHeight() : pdf.internal.pageSize.getWidth();

    if (!isFirstPage) {
      if (orientation === "landscape") pdf.addPage(undefined, "landscape");
      else pdf.addPage([pdf.internal.pageSize.getHeight(), pdf.internal.pageSize.getWidth()], "portrait");
    }

    const imgEl = new Image();
    imgEl.src = dataUrl;
    await new Promise((res) => (imgEl.onload = res));
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
    isFirstPage = false;
  };

  const totalResorts = resorts.length;
  let resortIndex = 0;
  // initial progress report
  if (onProgress) try { onProgress(0, totalResorts, null); } catch(e) {}

  for (const r of resorts) {
    resortIndex++;
    // report start of processing this resort (mark as current)
    if (onProgress) try { onProgress(resortIndex, totalResorts, r.name); } catch(e) {}
    try {
      if (typeof window === "undefined") break;
      window.localStorage.setItem("selectedResort", r.key);
      window.dispatchEvent(new CustomEvent("resort-change"));

      // Ensure app route is root so Index components render (chart/list exist)
      try {
        if (window.location.pathname !== '/') {
          window.history.pushState({}, '', '/');
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
      } catch (e) {}

      // Wait shortly for the UI to update
      await new Promise((r) => setTimeout(r, 300));

      // reaffirm current progress after UI update
      if (onProgress) try { onProgress(resortIndex, totalResorts, r.name); } catch(e) {}

      if (mode === "both" || mode === "graphics") {
        // Try capture up to 3 times (initial wait + backoff) to allow UI to render
        let capturedGraphics = false;
        const settings = loadSettings();
        const maxAttempts = Math.max(1, settings.pdfExportRetries || 3);
        const elementTimeout = Math.max(timeoutMs, 15000);
        for (let attempt = 0; attempt < maxAttempts && !capturedGraphics; attempt++) {
          const chartEl = await waitForElement("chart-wrapper", elementTimeout);
          const listEl = await waitForElement("list-wrapper", elementTimeout);
          if (chartEl && listEl) {
            try {
              // allow UI to fully render charts
              const waitMs = preCaptureMs + attempt * 700;
              await new Promise((res) => setTimeout(res, waitMs));

              // Build chart container (with hotel name) and render
              const chartContainer = document.createElement("div");
              chartContainer.style.width = "794px";
              chartContainer.style.minHeight = "500px";
              chartContainer.style.padding = "24px";
              chartContainer.style.background = "white";
              chartContainer.style.boxSizing = "border-box";
              chartContainer.style.fontFamily = "Inter, Arial, Helvetica, sans-serif";
              chartContainer.style.color = "#0f172a";

              const header = document.createElement("div");
              header.style.display = "flex";
              header.style.justifyContent = "space-between";
              header.style.alignItems = "center";
              header.style.marginBottom = "12px";
              header.innerHTML = `<div style="font-size:18px;font-weight:700">${r.name}</div>`;
              chartContainer.appendChild(header);

              const clonedChart = chartEl.cloneNode(true) as HTMLElement;
              clonedChart.style.width = "100%";
              clonedChart.style.height = "auto";
              clonedChart.querySelectorAll?.(".animate-pulse").forEach((el: any) => (el.className = ""));
              chartContainer.appendChild(clonedChart);

              chartContainer.style.position = "fixed";
              chartContainer.style.left = "-9999px";
              document.body.appendChild(chartContainer);
              const chartCanvas = await html2canvas(chartContainer, { scale: canvasScale, useCORS: true, backgroundColor: "#ffffff" });
              document.body.removeChild(chartContainer);

              const chartImgData = chartCanvas.toDataURL("image/png");
              await addScaledImage(final, chartImgData, "landscape");

              // Now render the distribution/list page (portrait)
              const page2 = makePage2Clone(listEl as HTMLElement);
              page2.style.position = "fixed";
              page2.style.left = "-9999px";
              document.body.appendChild(page2);
              const listCanvas = await html2canvas(page2, { scale: canvasScale, useCORS: true, backgroundColor: "#ffffff" });
              document.body.removeChild(page2);
              const listImgData = listCanvas.toDataURL("image/png");
              await addScaledImage(final, listImgData, "portrait");

              capturedGraphics = true;
            } catch (err) {
              console.warn(`Attempt ${attempt} failed capturing graphics for ${r.key}:`, err);
              // continue to next attempt
            }
          } else {
            console.warn(`Elements not found for graphics attempt ${attempt} on ${r.key}`);
          }
          if (!capturedGraphics) await new Promise((res) => setTimeout(res, 500 + attempt * 300));
        }
        if (!capturedGraphics) console.warn(`Skipping graphic pages for ${r.key} after retries`);
      }

      if (mode === "both" || mode === "official") {
        const settings2 = loadSettings();
        const maxAttempts2 = Math.max(1, settings2.pdfExportRetries || 3);
        let capturedSummary = false;
        for (let attempt = 0; attempt < maxAttempts2 && !capturedSummary; attempt++) {
          const summaryEl = await waitForElement("pdf-summary", timeoutMs);
          const listEl = await waitForElement("list-wrapper", timeoutMs);
          if (summaryEl && listEl) {
            try {
              const waitMs = preCaptureMs + attempt * 700;
              await new Promise((res) => setTimeout(res, waitMs));
              const summaryContainer = makeSummaryClone(summaryEl as HTMLElement);
              summaryContainer.style.position = "fixed";
              summaryContainer.style.left = "-9999px";
              document.body.appendChild(summaryContainer);
              const summaryCanvas = await html2canvas(summaryContainer, { scale: canvasScale, useCORS: true, backgroundColor: "#ffffff" });
              document.body.removeChild(summaryContainer);
              const summaryImg = summaryCanvas.toDataURL("image/png");
              await addScaledImage(final, summaryImg, "landscape");

              capturedSummary = true;
            } catch (err) {
              console.warn(`Attempt ${attempt} failed capturing official for ${r.key}:`, err);
            }
          } else {
            console.warn(`Elements not found for official attempt ${attempt} on ${r.key}`);
          }
          if (!capturedSummary) await new Promise((res) => setTimeout(res, 500 + attempt * 300));
        }
        if (!capturedSummary) console.warn(`Skipping official page for ${r.key} after retries`);
      }
    } catch (err) {
      console.error("Error exporting resort", r.key, err);
    }
    // report progress after each resort (whether succeeded or not)
    try {
      if (onProgress) onProgress(resortIndex, totalResorts, r.name);
    } catch (e) {}
  }

  // restore original selected resort
  if (original) {
    window.localStorage.setItem("selectedResort", original);
    window.dispatchEvent(new CustomEvent("resort-change"));
  }

  // Trigger single download
  try {
    final.save("rapports_tous_hotels.pdf");
  } catch (e) {
    console.error("Failed to save combined PDF:", e);
    alert("Erreur lors de la génération du PDF combiné");
  }
}
