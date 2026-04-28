// ═══════════════════════════════════════════════════════════════════════════════
// AI Doc Extractor — main.js
// Handles: upload page, result page (auto-download), preview page (sheet viewer)
// ═══════════════════════════════════════════════════════════════════════════════

const API_BASE   = window.location.origin;
const RESULT_KEY = "doc_extractor_result";
const path       = window.location.pathname;

// ── Bootstrap ─────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  if (path.includes("upload"))      initUploadPage();
  else if (path.includes("result")) initResultPage();
  else if (path.includes("preview")) initPreviewPage();
  else if (path.includes("processing")) initProcessingPage();
});

// ═══════════════════════════════════════════════════════════════════════════════
// UPLOAD PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function initUploadPage() {
  const dropZone    = document.getElementById("drop-zone");
  const fileInput   = document.getElementById("file-input");
  const filePreview = document.getElementById("file-preview");
  const fileNameEl  = document.getElementById("file-name");
  const fileSizeEl  = document.getElementById("file-size");
  const fileIconEl  = document.getElementById("file-icon");
  const removeBtn   = document.getElementById("remove-btn");
  const extractBtn  = document.getElementById("extract-btn");
  const errorBox    = document.getElementById("error-box");
  const errorMsg    = document.getElementById("error-msg");

  let selectedFile = null;

  function showError(msg) {
    errorMsg.textContent = msg;
    errorBox.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function clearError() { errorBox.classList.add("hidden"); }

  function setFile(file) {
    if (!file) return;
    const allowed = ["application/pdf","image/png","image/jpeg","image/webp","image/tiff"];
    if (!allowed.includes(file.type)) {
      showError(`Unsupported type: ${file.type}. Upload a PDF or image.`);
      return;
    }
    if (file.size > 20 * 1024 * 1024) { showError("File exceeds the 20 MB limit."); return; }
    clearError();
    selectedFile           = file;
    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = formatBytes(file.size);
    fileIconEl.textContent = file.type === "application/pdf" ? "📄" : "🖼";
    filePreview.classList.add("show");
    extractBtn.disabled    = false;
  }

  function clearFile() {
    selectedFile = null;
    fileInput.value = "";
    filePreview.classList.remove("show");
    extractBtn.disabled = true;
    clearError();
  }

  fileInput.addEventListener("change", () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });
  removeBtn?.addEventListener("click", clearFile);
  dropZone?.addEventListener("dragover",  e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
  dropZone?.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone?.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  });
  dropZone?.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") fileInput.click(); });

  // Show any error that survived a reload
  const storedError = sessionStorage.getItem("upload_error");
  if (storedError) { showError(storedError); sessionStorage.removeItem("upload_error"); }

  extractBtn.onclick = async () => {
    if (!selectedFile) return;
    clearError();
    extractBtn.disabled = true;

    // Swap card to inline processing UI
    const card = document.querySelector(".card");
    if (card) {
      card.innerHTML = `
        <div style="text-align:center; padding:20px 0;">
          <div style="font-size:52px; margin-bottom:20px; display:inline-block; animation:gearSpin 2.5s linear infinite;">⚙</div>
          <div class="page-label" style="display:block; text-align:center;">Processing</div>
          <h2 style="margin-bottom:8px;">Uploading document…</h2>
          <p style="margin-bottom:24px; color:var(--muted);">Sending to extraction pipeline.</p>
          <div class="progress-wrap">
            <div class="progress-track">
              <div class="progress-bar indeterminate"></div>
            </div>
          </div>
          <ul class="steps-list" style="text-align:left; max-width:320px; margin:24px auto 0;">
            <li class="step-item active" id="ps-upload"><div class="step-dot"></div><span>Uploading file</span></li>
            <li class="step-item" id="ps-extract"><div class="step-dot"></div><span>Extracting text (PDF / OCR)</span></li>
            <li class="step-item" id="ps-llm"><div class="step-dot"></div><span>Analysing with Ollama LLM</span></li>
            <li class="step-item" id="ps-excel"><div class="step-dot"></div><span>Generating Excel workbook</span></li>
          </ul>
          <p class="text-xs text-muted" style="margin-top:20px;">LLM inference may take 10–60 seconds.</p>
        </div>`;

      if (!document.getElementById("gear-style")) {
        const s = document.createElement("style");
        s.id = "gear-style";
        s.textContent = "@keyframes gearSpin { to { transform: rotate(360deg); } }";
        document.head.appendChild(s);
      }
    }

    tickSteps(["ps-upload","ps-extract","ps-llm"], [0, 1800, 4000]);

    try {
      const formData = new FormData();
      formData.append("document", selectedFile);

      const res  = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `Server error ${res.status}`);

      markStepDone("ps-llm");
      markStepActive("ps-excel");
      await sleep(700);
      markStepDone("ps-excel");
      await sleep(350);

      sessionStorage.setItem(RESULT_KEY, JSON.stringify(json));
      window.location.href = "result.html";
    } catch (err) {
      sessionStorage.setItem("upload_error", err.message);
      window.location.reload();
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESULT PAGE — extracted data view + auto-download with original filename
// ═══════════════════════════════════════════════════════════════════════════════
function initResultPage() {
  const resultStr = sessionStorage.getItem(RESULT_KEY);
  if (!resultStr) { window.location.href = "upload.html"; return; }

  let result;
  try { result = JSON.parse(resultStr); }
  catch { window.location.href = "upload.html"; return; }

  const { data, excelBase64, originalName } = result;
  const baseName   = originalName || "document";
  const stemName   = baseName.replace(/\.[^/.]+$/, "");
  const dlFilename = `${stemName}-extracted.xlsx`;

  const el = id => document.getElementById(id);

  // Labels
  if (el("result-filename"))   el("result-filename").textContent   = baseName;
  if (el("dl-filename-label")) el("dl-filename-label").textContent = dlFilename;

  // Download button — decode base64 blob and trigger save-as
  const downloadBtn = el("download-btn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", e => {
      e.preventDefault();
      triggerBase64Download(excelBase64, dlFilename);
    });
  }

  // Preview button
  if (el("preview-btn")) el("preview-btn").href = "preview.html";

  // ── Auto-download ~1 s after page load ────────────────────────────────────
  const banner = el("auto-dl-banner");
  setTimeout(() => {
    try {
      triggerBase64Download(excelBase64, dlFilename);
      if (banner) {
        banner.classList.add("done");
        banner.innerHTML = `
          <span style="color:var(--success); font-size:16px;">✓</span>
          <span>Auto-downloaded as <strong>${dlFilename}</strong></span>`;
      }
    } catch {
      if (banner) {
        banner.style.borderColor = "rgba(248,113,113,0.3)";
        banner.style.background  = "rgba(248,113,113,0.06)";
        banner.innerHTML = `
          <span style="color:var(--error)">⚠</span>
          <span style="color:var(--muted)">Auto-download blocked — click <strong>Download .xlsx</strong> above.</span>`;
      }
    }
  }, 950);

  // ── Summary grid ──────────────────────────────────────────────────────────
  const summaryGrid = el("summary-grid");
  if (summaryGrid) {
    const fields = [
      { label: "Vendor",       value: data.vendor },
      { label: "Invoice No.",  value: data.invoiceNumber },
      { label: "Customer",     value: data.name },
      { label: "Date",         value: data.date },
      { label: "Due Date",     value: data.dueDate },
      { label: "Currency",     value: data.currency },
      { label: "Subtotal",     value: data.subtotal   != null ? fmtMoney(data.subtotal,   data.currency) : null },
      { label: "Tax",          value: data.taxAmount  != null ? fmtMoney(data.taxAmount,  data.currency) : null },
      { label: "Total Amount", value: data.amount     != null ? fmtMoney(data.amount,     data.currency) : null, accent: true },
      { label: "Payment",      value: data.paymentMethod },
      { label: "Address",      value: data.address },
      { label: "Summary",      value: data.summary },
    ];
    fields.forEach(({ label, value, accent }) => {
      if (value == null) return;
      const cell = document.createElement("div");
      cell.className = "data-cell";
      cell.innerHTML = `
        <div class="data-cell-label">${esc(label)}</div>
        <div class="data-cell-value${accent ? " accent" : ""}">${esc(String(value))}</div>`;
      summaryGrid.appendChild(cell);
    });
  }

  // ── Line items ────────────────────────────────────────────────────────────
  const items = Array.isArray(data.items) && data.items.length ? data.items : null;
  if (items) {
    el("items-section")?.classList.remove("hidden");
    const tbody = el("items-body");
    items.forEach((item, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="text-center text-mono">${i + 1}</td>
        <td>${esc(item.description || "—")}</td>
        <td class="text-center">${item.quantity ?? "—"}</td>
        <td class="text-right text-mono">${item.unitPrice != null ? fmtMoney(item.unitPrice) : "—"}</td>
        <td class="text-right text-mono">${item.total     != null ? fmtMoney(item.total)     : "—"}</td>`;
      tbody.appendChild(tr);
    });
  }

  // ── JSON viewer ───────────────────────────────────────────────────────────
  const jsonViewer = el("json-viewer");
  if (jsonViewer) jsonViewer.innerHTML = syntaxHL(data);

  el("copy-btn")?.addEventListener("click", () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => {
      const btn = el("copy-btn");
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy JSON"), 2000);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREVIEW PAGE — full spreadsheet-style workbook viewer
// ═══════════════════════════════════════════════════════════════════════════════
function initPreviewPage() {
  const resultStr = sessionStorage.getItem(RESULT_KEY);

  if (!resultStr) {
    document.getElementById("no-data-card")?.classList.remove("hidden");
    document.getElementById("sheet-tabs")?.classList.add("hidden");
    ["panel-summary","panel-items","panel-json"].forEach(id =>
      document.getElementById(id)?.classList.add("hidden")
    );
    return;
  }

  let result;
  try { result = JSON.parse(resultStr); }
  catch {
    document.getElementById("no-data-card")?.classList.remove("hidden");
    return;
  }

  const { data, excelBase64, originalName } = result;
  const baseName   = originalName || "document";
  const stemName   = baseName.replace(/\.[^/.]+$/, "");
  const dlFilename = `${stemName}-extracted.xlsx`;

  // File badge
  const badge = document.getElementById("preview-file-badge");
  if (badge) badge.textContent = baseName;

  // Download button — base64 blob, no server round-trip
  const dlBtn = document.getElementById("preview-download-btn");
  if (dlBtn) {
    dlBtn.addEventListener("click", e => {
      e.preventDefault();
      triggerBase64Download(excelBase64, dlFilename);
    });
  }

  // ── Tab switching ─────────────────────────────────────────────────────────
  document.querySelectorAll(".sheet-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".sheet-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".sheet-panel").forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`panel-${tab.dataset.sheet}`)?.classList.add("active");
    });
  });

  // ── Render all three sheets ───────────────────────────────────────────────
  renderSummarySheet(data);
  renderItemsSheet(data);
  renderJsonSheet(data);
}

// ── Summary Sheet ─────────────────────────────────────────────────────────────
function renderSummarySheet(data) {
  const container = document.getElementById("summary-content");
  if (!container) return;

  const itemCount  = Array.isArray(data.items) ? data.items.length : 0;
  const fieldCount = Object.values(data).filter(v => v != null && v !== "").length;

  const statsHtml = `
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-val">${fieldCount}</div>
        <div class="stat-lbl">Fields extracted</div>
      </div>
      <div class="stat-item">
        <div class="stat-val">${itemCount}</div>
        <div class="stat-lbl">Line items found</div>
      </div>
      ${data.amount != null ? `
      <div class="stat-item">
        <div class="stat-val">${fmtMoney(data.amount, data.currency)}</div>
        <div class="stat-lbl">Total amount</div>
      </div>` : ""}
    </div>`;

  const fields = [
    ["Vendor / Issuer",  data.vendor,          ""],
    ["Invoice Number",   data.invoiceNumber,    ""],
    ["Customer Name",    data.name,             ""],
    ["Date",             data.date,             ""],
    ["Due Date",         data.dueDate,          ""],
    ["Payment Method",   data.paymentMethod,    ""],
    ["Currency",         data.currency,         ""],
    ["Address",          data.address,          ""],
    ["Subtotal",         data.subtotal   != null ? fmtMoney(data.subtotal,   data.currency) : null, "money"],
    ["Tax Amount",       data.taxAmount  != null ? fmtMoney(data.taxAmount,  data.currency) : null, "money"],
    ["Total Amount",     data.amount     != null ? fmtMoney(data.amount,     data.currency) : null, "money"],
    ["Summary / Notes",  data.summary,          ""],
  ];

  const rows = fields.map(([label, value, type], i) => {
    const isNull   = value == null;
    const valClass = isNull ? "cell-null" : type === "money" ? "cell-money" : "cell-value";
    const display  = isNull ? "—" : String(value);
    return `
      <tr>
        <td class="row-num">${i + 1}</td>
        <td class="cell-label">${esc(label)}</td>
        <td class="${valClass}">${esc(display)}</td>
      </tr>`;
  }).join("");

  const tableHtml = `
    <div class="ss-wrap">
      <div class="summary-sheet-title">Document Extraction Summary</div>
      <table class="ss-table">
        <thead>
          <tr>
            <td class="corner-cell row-num"></td>
            <th class="col-head" style="min-width:180px">Field</th>
            <th class="col-head">Extracted Value</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  container.innerHTML = statsHtml + tableHtml;
}

// ── Line Items Sheet ──────────────────────────────────────────────────────────
function renderItemsSheet(data) {
  const container = document.getElementById("items-content");
  if (!container) return;

  const items = Array.isArray(data.items) ? data.items : [];

  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="es-icon">≡</div>
        <p>No line items were detected in this document.</p>
      </div>`;
    return;
  }

  const runningTotal = items.reduce((s, it) => s + (typeof it.total === "number" ? it.total : 0), 0);

  const bodyRows = items.map((item, i) => `
    <tr>
      <td class="row-num">${i + 1}</td>
      <td class="cell-value">${esc(item.description || "—")}</td>
      <td class="cell-num">${item.quantity != null ? item.quantity : "—"}</td>
      <td class="cell-money">${item.unitPrice != null ? fmtMoney(item.unitPrice) : "—"}</td>
      <td class="cell-money">${item.total     != null ? fmtMoney(item.total)     : "—"}</td>
    </tr>`).join("");

  const totalRow = runningTotal > 0 ? `
    <tr>
      <td class="row-num"></td>
      <td class="cell-total-label" colspan="3" style="letter-spacing:1px;">TOTAL</td>
      <td class="cell-total">${fmtMoney(runningTotal)}</td>
    </tr>` : "";

  container.innerHTML = `
    <div class="ss-wrap">
      <table class="ss-table">
        <thead>
          <tr>
            <td class="corner-cell row-num"></td>
            <th class="col-head" style="min-width:260px">Description</th>
            <th class="col-head" style="text-align:center; min-width:80px">Qty</th>
            <th class="col-head" style="text-align:right; min-width:120px">Unit Price</th>
            <th class="col-head" style="text-align:right; min-width:120px">Total</th>
          </tr>
        </thead>
        <tbody>${bodyRows}${totalRow}</tbody>
      </table>
    </div>`;
}

// ── Raw JSON Sheet ────────────────────────────────────────────────────────────
function renderJsonSheet(data) {
  const container = document.getElementById("json-content");
  if (!container) return;

  const jsonStr = JSON.stringify(data, null, 2);
  const keys    = Object.keys(data).length;
  const chars   = jsonStr.length;

  container.innerHTML = `
    <div class="json-sheet-wrap">
      <div class="json-sheet-toolbar">
        <span>raw-json &nbsp;·&nbsp; ${keys} keys &nbsp;·&nbsp; ${chars} chars</span>
        <button class="btn btn-ghost text-xs" id="json-copy-btn">Copy</button>
      </div>
      <div class="json-raw">${syntaxHL(data)}</div>
    </div>`;

  document.getElementById("json-copy-btn")?.addEventListener("click", () => {
    navigator.clipboard.writeText(jsonStr).then(() => {
      const btn = document.getElementById("json-copy-btn");
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy"), 2000);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROCESSING PAGE (redirect fallback)
// ═══════════════════════════════════════════════════════════════════════════════
function initProcessingPage() {
  if (sessionStorage.getItem(RESULT_KEY))         { window.location.href = "result.html"; return; }
  if (!sessionStorage.getItem("pending_upload"))  { window.location.href = "upload.html"; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/** Decode a base64 Excel string and trigger a browser save-as — no server round-trip */
function triggerBase64Download(base64, filename) {
  const bytes  = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const blob   = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement("a");
  a.href       = url;
  a.download   = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 3000);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatBytes(bytes) {
  if (bytes < 1024)         return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function fmtMoney(value, currency) {
  if (typeof value !== "number") return String(value);
  try {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...(currency && currency.length === 3 ? { style: "currency", currency } : {}),
    });
  } catch {
    return value.toFixed(2);
  }
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function syntaxHL(json) {
  const str = JSON.stringify(json, null, 2);
  return str.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    match => {
      let cls = "json-num";
      if (/^"/.test(match))              cls = /:$/.test(match) ? "json-key" : "json-str";
      else if (/true|false/.test(match)) cls = "json-bool";
      else if (/null/.test(match))       cls = "json-null";
      return `<span class="${cls}">${esc(match)}</span>`;
    }
  );
}

function markStepDone(id)   { document.getElementById(id)?.classList.replace("active", "done"); }
function markStepActive(id) { document.getElementById(id)?.classList.add("active"); }

function tickSteps(ids, delays) {
  ids.forEach((id, i) => {
    setTimeout(() => {
      if (i > 0) markStepDone(ids[i - 1]);
      markStepActive(id);
    }, delays[i]);
  });
}
