import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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
  left.innerHTML = `<h2 style="margin:0;font-size:20px;font-weight:700">VM Resort - Albanie</h2><div style="margin-top:8px;color:#475569">Rapport de satisfaction</div>`;

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
  cloned.querySelectorAll(".animate-pulse").forEach((el) => (el.className = ""));

  container.appendChild(cloned);
  return container;
}

function makeSummaryClone(summaryEl: HTMLElement) {
  const container = document.createElement('div');
  container.style.width = '1123px'; // landscape A4 approx at 96dpi
  container.style.minHeight = '794px';
  container.style.padding = '48px';
  container.style.background = 'white';
  container.style.boxSizing = 'border-box';
  container.style.fontFamily = 'Inter, Arial, Helvetica, sans-serif';
  container.style.color = '#0f172a';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';

  const left = document.createElement('div');
  left.innerHTML = `<h1 style="margin:0;font-size:22px;font-weight:800">VM Resort - Albanie</h1><div style="margin-top:6px;color:#475569">Rapport de satisfaction</div>`;
  const right = document.createElement('div');
  right.innerHTML = `<div style="text-align:right;color:#94a3b8;font-size:12px">Generated: ${new Date().toLocaleDateString()}</div>`;
  header.appendChild(left);
  header.appendChild(right);
  container.appendChild(header);

  const hr = document.createElement('div');
  hr.style.height = '1px';
  hr.style.background = '#e6edf3';
  hr.style.margin = '16px 0 20px 0';
  container.appendChild(hr);

  // Insert the summary element
  const clonedSummary = summaryEl.cloneNode(true) as HTMLElement;
  clonedSummary.style.width = '100%';
  clonedSummary.style.marginTop = '8px';
  clonedSummary.querySelectorAll('.animate-pulse').forEach((el) => (el.className = ''));
  container.appendChild(clonedSummary);

  return container;
}

export default async function exportToPdf(options: { chartId?: string; listId: string; summaryId?: string; filename?: string }) {
  const { chartId, listId, summaryId, filename = "vm-resort-report.pdf" } = options;
  const chartEl = chartId ? document.getElementById(chartId) : null;
  const listEl = document.getElementById(listId);
  if (!listEl) throw new Error("List element not found");

  // If summaryId provided -> official mode: create page1 from summary, page2 from list (no chart)
  if (summaryId) {
    const summaryEl = document.getElementById(summaryId);
    if (!summaryEl) throw new Error('Summary element not found');

    const page1 = makeSummaryClone(summaryEl);
    const page2 = makePage2Clone(listEl);

    page1.style.position = 'fixed';
    page1.style.left = '-9999px';
    document.body.appendChild(page1);
    const page1Canvas = await html2canvas(page1, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    document.body.removeChild(page1);

    page2.style.position = 'fixed';
    page2.style.left = '-9999px';
    document.body.appendChild(page2);
    const page2Canvas = await html2canvas(page2, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
    document.body.removeChild(page2);

    const final = new jsPDF({ unit: 'px', format: 'a4', orientation: 'portrait' });

    // Page 1: summary (portrait)
    const img1 = page1Canvas.toDataURL('image/png');
    final.addImage(img1, 'PNG', 20, 20, final.internal.pageSize.getWidth() - 40, final.internal.pageSize.getHeight() - 40);

    // Page 2: list (portrait)
    final.addPage();
    const img2 = page2Canvas.toDataURL('image/png');
    final.addImage(img2, 'PNG', 20, 20, final.internal.pageSize.getWidth() - 40, final.internal.pageSize.getHeight() - 40);

    final.save(filename);
    return;
  }

  // default behavior: include chart first
  if (!chartEl) throw new Error("Chart element not found");
  const chartCanvas = await html2canvas(chartEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  const page2 = makePage2Clone(listEl);
  page2.style.position = 'fixed';
  page2.style.left = '-9999px';
  document.body.appendChild(page2);
  const listCanvas = await html2canvas(page2, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  document.body.removeChild(page2);

  const final = new jsPDF({ unit: 'px', format: 'a4', orientation: 'landscape' });
  const chartImgData = chartCanvas.toDataURL('image/png');
  final.addImage(chartImgData, 'PNG', 20, 20, final.internal.pageSize.getWidth() - 40, final.internal.pageSize.getHeight() - 40);
  final.addPage([final.internal.pageSize.getHeight(), final.internal.pageSize.getWidth()], 'portrait');
  const listImgData = listCanvas.toDataURL('image/png');
  final.addImage(listImgData, 'PNG', 20, 20, final.internal.pageSize.getWidth() - 40, final.internal.pageSize.getHeight() - 40);
  final.save(filename);
}
