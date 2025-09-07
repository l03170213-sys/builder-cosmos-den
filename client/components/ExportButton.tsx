import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export default async function exportToPdf(options: { chartId: string; listId: string; filename?: string }) {
  const { chartId, listId, filename = "vm-resort-report.pdf" } = options;
  const chartEl = document.getElementById(chartId);
  const listEl = document.getElementById(listId);
  if (!chartEl || !listEl) throw new Error("Chart or list element not found");

  // Render chart as canvas
  const chartCanvas = await html2canvas(chartEl, { scale: 2, useCORS: true, backgroundColor: null });
  const listCanvas = await html2canvas(listEl, { scale: 2, useCORS: true, backgroundColor: null });

  const pdf = new jsPDF({ unit: "px", format: "a4" });

  // Page 1: landscape with chart
  const a4Width = pdf.internal.pageSize.getWidth();
  const a4Height = pdf.internal.pageSize.getHeight();

  // convert to landscape size
  pdf.setProperties({ title: filename });

  // Add chart image scaled to landscape page while preserving aspect ratio
  const chartImgData = chartCanvas.toDataURL("image/png");
  // Rotate page to landscape by swapping w/h when placing image
  const landscapeW = a4Height; // swap
  const landscapeH = a4Width;
  // create a new page in orientation landscape: jsPDF doesn't have easy rotate, so we'll add image centered and then add a page rotated by using addPage with dimensions swapped
  // Workaround: create landscape page by creating a new jsPDF with landscape orientation and then copy images; easier: directly use internal API to set page orientation
  const pdfLandscape = new jsPDF({ unit: "px", format: "a4", orientation: "landscape" });
  pdfLandscape.addImage(chartImgData, "PNG", 20, 20, pdfLandscape.internal.pageSize.getWidth() - 40, pdfLandscape.internal.pageSize.getHeight() - 40);

  // Now add portrait page for list
  const pdfFinal = new jsPDF({ unit: "px", format: "a4", orientation: "landscape" });
  // Compose into final PDF: add landscape chart as first page
  const chartPage = pdfLandscape.output("datauristring");
  // Unfortunately jsPDF cannot import datauri of a whole PDF; instead we'll build final PDF directly: first add chart image then add a new page and add list image
  const final = new jsPDF({ unit: "px", format: "a4", orientation: "landscape" });
  final.addImage(chartImgData, "PNG", 20, 20, final.internal.pageSize.getWidth() - 40, final.internal.pageSize.getHeight() - 40);

  // Add new page for list in portrait orientation: we'll add a portrait page by adding page with flipped orientation
  final.addPage([a4Width, a4Height], "portrait");
  const listImgData = listCanvas.toDataURL("image/png");
  // Fit list image into portrait page
  final.addImage(listImgData, "PNG", 20, 20, final.internal.pageSize.getWidth() - 40, final.internal.pageSize.getHeight() - 40);

  final.save(filename);
}
