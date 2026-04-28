import ExcelJS from "exceljs";

/**
 * Generates an Excel workbook entirely in memory and returns it as a Buffer.
 * Nothing is written to disk.
 * @param {object} data - Structured data from Ollama.
 * @returns {Promise<Buffer>} - Raw .xlsx bytes.
 */
export async function generateExcel(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AI Doc Extractor";
  workbook.created = new Date();

  // ── Sheet 1: Summary ──────────────────────────────────────────────────────
  const summarySheet = workbook.addWorksheet("Summary");
  styleSheet(summarySheet);

  // Title row
  summarySheet.mergeCells("A1:B1");
  const titleCell = summarySheet.getCell("A1");
  titleCell.value = "Document Extraction Summary";
  titleCell.font = { bold: true, size: 16, color: { argb: "FF1A1A2E" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F4FD" } };
  summarySheet.getRow(1).height = 36;

  summarySheet.addRow([]); // spacer

  // Summary fields
  const summaryFields = [
    ["Vendor / Issuer",   data.vendor],
    ["Invoice Number",    data.invoiceNumber],
    ["Customer Name",     data.name],
    ["Date",              data.date],
    ["Due Date",          data.dueDate],
    ["Payment Method",    data.paymentMethod],
    ["Currency",          data.currency],
    ["Subtotal",          data.subtotal != null ? formatCurrency(data.subtotal) : null],
    ["Tax Amount",        data.taxAmount != null ? formatCurrency(data.taxAmount) : null],
    ["Total Amount",      data.amount != null ? formatCurrency(data.amount) : null],
    ["Address",           data.address],
    ["Summary",           data.summary],
  ];

  summaryFields.forEach(([label, value], i) => {
    const row = summarySheet.addRow([label, value ?? "—"]);
    const labelCell = row.getCell(1);
    const valueCell = row.getCell(2);

    labelCell.font = { bold: true, color: { argb: "FF4A5568" } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 === 0 ? "FFF7FAFC" : "FFFFFFFF" } };
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 === 0 ? "FFF7FAFC" : "FFFFFFFF" } };
    valueCell.alignment = { wrapText: true };
  });

  summarySheet.getColumn(1).width = 22;
  summarySheet.getColumn(2).width = 52;

  // ── Sheet 2: Line Items ───────────────────────────────────────────────────
  const itemsSheet = workbook.addWorksheet("Line Items");
  styleSheet(itemsSheet);

  const headers = ["#", "Description", "Quantity", "Unit Price", "Total"];
  const headerRow = itemsSheet.addRow(headers);

  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2D3748" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF4A5568" } } };
  });
  itemsSheet.getRow(1).height = 28;

  const items = Array.isArray(data.items) ? data.items : [];

  if (items.length === 0) {
    const emptyRow = itemsSheet.addRow(["—", "No line items found", "—", "—", "—"]);
    emptyRow.eachCell((c) => (c.alignment = { horizontal: "center" }));
  } else {
    items.forEach((item, idx) => {
      const row = itemsSheet.addRow([
        idx + 1,
        item.description ?? "—",
        item.quantity ?? "—",
        item.unitPrice != null ? item.unitPrice : "—",
        item.total != null ? item.total : "—",
      ]);

      const isEven = idx % 2 === 0;
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isEven ? "FFFAFAFA" : "FFFFFFFF" } };
        cell.alignment = { wrapText: true, vertical: "top" };
      });

      // Number format for price columns
      ["D", "E"].forEach((col) => {
        const cell = row.getCell(col);
        if (typeof cell.value === "number") {
          cell.numFmt = '#,##0.00';
          cell.alignment = { horizontal: "right" };
        }
      });

      row.getCell("C").alignment = { horizontal: "center" };
    });

    // Totals footer
    itemsSheet.addRow([]);
    const totalRow = itemsSheet.addRow(["", "TOTAL", "", "", data.amount ?? "—"]);
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F4FD" } };
    });
    if (typeof data.amount === "number") {
      totalRow.getCell("E").numFmt = '#,##0.00';
      totalRow.getCell("E").alignment = { horizontal: "right" };
    }
  }

  itemsSheet.getColumn(1).width = 6;
  itemsSheet.getColumn(2).width = 48;
  itemsSheet.getColumn(3).width = 12;
  itemsSheet.getColumn(4).width = 14;
  itemsSheet.getColumn(5).width = 14;

  // ── Sheet 3: Raw JSON ─────────────────────────────────────────────────────
  const rawSheet = workbook.addWorksheet("Raw JSON");
  rawSheet.getCell("A1").value = "Raw Extracted JSON";
  rawSheet.getCell("A1").font = { bold: true, size: 13 };
  rawSheet.addRow([]);
  rawSheet.getCell("A3").value = JSON.stringify(data, null, 2);
  rawSheet.getCell("A3").alignment = { wrapText: true, vertical: "top" };
  rawSheet.getColumn(1).width = 80;
  rawSheet.getRow(3).height = 400;

  // ── Return as Buffer (no disk write) ─────────────────────────────────────
  return workbook.xlsx.writeBuffer();
}

function styleSheet(sheet) {
  sheet.properties.defaultRowHeight = 22;
  sheet.views = [{ showGridLines: true }];
}

function formatCurrency(value) {
  if (typeof value !== "number") return value;
  return value.toLocaleString("en-US", { minimumFractionDigits: 2 });
}
