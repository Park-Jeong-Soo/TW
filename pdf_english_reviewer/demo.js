// Client-side preview shim for TW/pdf_english_reviewer.
// Real app POSTs uploads to a FastAPI backend. On GitHub Pages the backend
// isn't available, so this file:
//   1. Intercepts the upload form and renders selected PDF via PDF.js.
//   2. Saves each uploaded PDF into IndexedDB (blob) + localStorage (metadata)
//      so Workspaces tab lists them and lets the user reopen.
//   3. Shows backend-required messages inside the Team Manual Standard and
//      Review Engines views.

(function () {
  const PDFJS_VERSION = "3.11.174";
  const PDFJS_SOURCES = [
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`,
    `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build`,
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`,
  ];

  const WS_STORAGE_KEY = "tw-demo-workspaces-v1";
  const IDB_NAME = "tw-demo-pdf-store";
  const IDB_STORE = "pdfs";

  let pdfjsReady = null;

  //
  // ─── PDF.js loader ──────────────────────────────────────────────────────
  //
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }

  async function ensurePdfjs() {
    if (pdfjsReady) return pdfjsReady;
    pdfjsReady = (async () => {
      let lastErr;
      for (const base of PDFJS_SOURCES) {
        try {
          await loadScript(`${base}/pdf.min.js`);
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${base}/pdf.worker.min.js`;
          return;
        } catch (err) {
          lastErr = err;
          console.warn("[demo] PDF.js load failed from", base, err);
        }
      }
      throw lastErr || new Error("All PDF.js CDNs failed");
    })();
    return pdfjsReady;
  }

  ensurePdfjs().catch((err) => console.warn("[demo] PDF.js preload failed:", err));

  //
  // ─── IndexedDB helpers (PDF blobs) ──────────────────────────────────────
  //
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(id, blob) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbGet(id) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbDelete(id) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  //
  // ─── Workspace metadata (localStorage) ──────────────────────────────────
  //
  function readWorkspaces() {
    try {
      return JSON.parse(localStorage.getItem(WS_STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }
  function writeWorkspaces(list) {
    localStorage.setItem(WS_STORAGE_KEY, JSON.stringify(list));
  }
  function addWorkspaceMeta(meta) {
    const list = readWorkspaces();
    list.unshift(meta);
    writeWorkspaces(list);
  }
  function removeWorkspaceMeta(id) {
    writeWorkspaces(readWorkspaces().filter((w) => w.id !== id));
  }

  function newId() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return "ws-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  //
  // ─── Upload form intercept (capture phase) ──────────────────────────────
  //
  document.addEventListener(
    "submit",
    async (event) => {
      const form = event.target;
      if (!form || form.id !== "upload-form") return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const fileInput = document.getElementById("pdf-file");
      const projectInput = document.getElementById("project-name");
      const reviewerInput = document.getElementById("reviewer");
      const file = fileInput && fileInput.files && fileInput.files[0];
      const btn = form.querySelector('button[type="submit"]');
      if (!file) {
        alert("Please choose a PDF file first.");
        return;
      }
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Rendering preview…";
      }
      try {
        await ensurePdfjs();
        const buffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;

        const id = newId();
        const blob = new Blob([buffer], { type: "application/pdf" });
        try {
          await idbPut(id, blob);
          addWorkspaceMeta({
            id,
            filename: file.name,
            project_name: (projectInput && projectInput.value) || "",
            reviewer: (reviewerInput && reviewerInput.value) || "",
            page_count: pdf.numPages,
            size_bytes: file.size,
            created_at: new Date().toISOString(),
          });
        } catch (storeErr) {
          console.warn("[demo] Workspace persist failed:", storeErr);
        }
        await renderViewer(pdf, file.name);
      } catch (err) {
        console.error("[demo] PDF render failed:", err);
        alert("PDF render failed: " + (err && err.message ? err.message : err));
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Open review workspace";
        }
      }
    },
    true
  );

  //
  // ─── Workspaces view: override loadWorkspaces ───────────────────────────
  //
  // app_v3.js declares `loadWorkspaces`, `renderWorkspaces`, `deleteWorkspace`
  // in script scope so `window.loadWorkspaces = ...` overrides them for
  // subsequent calls from the click handlers on the nav buttons.
  //
  window.loadWorkspaces = renderSavedWorkspaces;

  function renderSavedWorkspaces() {
    const container = document.getElementById("workspace-list");
    if (!container) return;
    const searchInput = document.getElementById("workspace-search");
    const query = (searchInput && searchInput.value.trim().toLowerCase()) || "";
    const list = readWorkspaces().filter((item) =>
      item.filename.toLowerCase().includes(query) ||
      (item.project_name || "").toLowerCase().includes(query)
    );

    if (!list.length) {
      container.innerHTML = `
        <div class="empty-issues" style="padding:24px;text-align:center;color:#6b7280;">
          No saved workspaces yet.<br/>
          <span style="font-size:12px;">Upload a PDF from the Reviewer tab to save it here for later.</span>
        </div>`;
      return;
    }

    container.innerHTML = list.map((item) => `
      <article class="workspace-card">
        <div class="workspace-card-main">
          <span class="term-status active">saved</span>
          <h3>${escapeHtml(item.filename)}</h3>
          <p>${escapeHtml(item.project_name || "—")} · ${item.page_count} pages · ${escapeHtml(item.reviewer || "—")}</p>
        </div>
        <div class="workspace-progress">
          <strong>Preview only</strong>
          <span>Saved ${escapeHtml(new Date(item.created_at).toLocaleString())} · ${formatBytes(item.size_bytes)}</span>
        </div>
        <div class="workspace-actions">
          <button class="primary" data-demo-open="${item.id}">Open Workspace</button>
          <button class="danger" data-demo-delete="${item.id}">Delete Workspace</button>
        </div>
      </article>
    `).join("");

    container.querySelectorAll("[data-demo-open]").forEach((b) =>
      b.addEventListener("click", () => openSavedWorkspace(b.dataset.demoOpen))
    );
    container.querySelectorAll("[data-demo-delete]").forEach((b) =>
      b.addEventListener("click", () => deleteSavedWorkspace(b.dataset.demoDelete))
    );
  }

  async function openSavedWorkspace(id) {
    const meta = readWorkspaces().find((w) => w.id === id);
    if (!meta) return alert("Workspace metadata missing.");
    try {
      const blob = await idbGet(id);
      if (!blob) return alert("Stored PDF blob not found. It may have been cleared by the browser.");
      await ensurePdfjs();
      const buffer = await blob.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
      if (typeof window.showView === "function") window.showView("reviewer");
      await renderViewer(pdf, meta.filename);
    } catch (err) {
      console.error("[demo] Reopen failed:", err);
      alert("Could not reopen workspace: " + (err && err.message ? err.message : err));
    }
  }

  async function deleteSavedWorkspace(id) {
    const meta = readWorkspaces().find((w) => w.id === id);
    if (!meta) return;
    if (!confirm(`Delete this workspace?\n\n${meta.filename}`)) return;
    try {
      await idbDelete(id);
    } catch (err) {
      console.warn("[demo] IDB delete failed (proceeding):", err);
    }
    removeWorkspaceMeta(id);
    renderSavedWorkspaces();
  }

  // Also override workspace-search input so live typing filters our list.
  document.addEventListener(
    "input",
    (event) => {
      if (event.target && event.target.id === "workspace-search") {
        renderSavedWorkspaces();
      }
    },
    true
  );

  //
  // ─── Reviewer viewer (preserves original layout) ────────────────────────
  //
  // Keeps the app's left sidebar, toolbar, and right issues panel intact;
  // only populates the document info, page label, and PDF canvas area.
  //
  const viewerState = { pdf: null, zoom: 1, viewMode: "one", currentPage: 1, filename: "" };

  async function renderViewer(pdf, name) {
    viewerState.pdf = pdf;
    viewerState.filename = name;
    viewerState.currentPage = 1;
    viewerState.zoom = 1;
    viewerState.viewMode = "one";

    const upload = document.getElementById("upload-panel");
    const workspace = document.getElementById("workspace");
    if (upload) upload.classList.add("hidden");
    if (!workspace) return;
    workspace.classList.remove("hidden");

    // Populate document header info.
    setText("document-name", name);
    setText("document-meta", `${pdf.numPages} pages · Preview mode`);
    setText("review-status", "Preview mode — review disabled (backend required)");
    setText("page-label", `/ ${pdf.numPages}`);
    setText("issue-total", "0");
    setText("dictionary-count", "0 terms");

    const pageInput = document.getElementById("page-number-input");
    if (pageInput) {
      pageInput.value = 1;
      pageInput.max = pdf.numPages;
    }

    // Empty out issues list with informative message.
    const issuesList = document.getElementById("issues-list");
    if (issuesList) {
      issuesList.innerHTML = `<div class="empty-issues" style="padding:20px;color:#6b7280;font-size:13px;line-height:1.5;">Review suggestions require the local FastAPI backend. Run <code>run_local.bat</code> to enable Full Review, Vale, Ollama, and Team Manual Standard checks.</div>`;
    }

    // Empty ollama log / engine cards with preview note.
    const ollamaLog = document.getElementById("ollama-log-list");
    if (ollamaLog) ollamaLog.innerHTML = `<span class="hint">Preview mode — Ollama disabled.</span>`;
    const dictList = document.getElementById("dictionary-list");
    if (dictList) dictList.innerHTML = `<span class="hint">Preview mode — glossary requires backend.</span>`;

    wireViewerToolbar();
    await renderCurrentPages();
  }

  async function renderCurrentPages() {
    const container = document.getElementById("pdf-document");
    if (!container || !viewerState.pdf) return;
    container.innerHTML = "";
    const pdf = viewerState.pdf;
    const total = pdf.numPages;
    const pagesToRender = viewerState.viewMode === "two"
      ? [viewerState.currentPage, viewerState.currentPage + 1].filter((n) => n >= 1 && n <= total)
      : [viewerState.currentPage];

    for (const pageNum of pagesToRender) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.3 * viewerState.zoom });
      const wrap = document.createElement("div");
      wrap.className = "pdf-page-wrap";
      wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;margin:12px auto;position:relative;";
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.maxWidth = "100%";
      canvas.style.height = "auto";
      canvas.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
      canvas.style.background = "#fff";
      wrap.appendChild(canvas);
      const label = document.createElement("div");
      label.textContent = `Page ${pageNum} / ${total}`;
      label.style.cssText = "font-size:11px;color:#6b7280;margin-top:6px;";
      wrap.appendChild(label);
      container.appendChild(wrap);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    }
    setText("zoom-label", Math.round(viewerState.zoom * 100) + "%");
  }

  let viewerWired = false;
  function wireViewerToolbar() {
    if (viewerWired) return;
    viewerWired = true;

    // Page navigation.
    on("previous-page-btn", "click", () => gotoPage(viewerState.currentPage - 1));
    on("next-page-btn", "click", () => gotoPage(viewerState.currentPage + step()));
    on("page-number-input", "change", (e) => gotoPage(parseInt(e.target.value, 10) || 1));

    // View mode.
    on("one-page-mode-btn", "click", () => setViewMode("one"));
    on("two-page-mode-btn", "click", () => setViewMode("two"));

    // Zoom.
    on("zoom-in-btn", "click", () => setZoom(viewerState.zoom * 1.15));
    on("zoom-out-btn", "click", () => setZoom(viewerState.zoom / 1.15));
    on("reset-zoom-btn", "click", () => setZoom(1));
    on("fit-width-btn", "click", () => setZoom(1.5));
    on("fit-page-btn", "click", () => setZoom(1));
  }

  function step() { return viewerState.viewMode === "two" ? 2 : 1; }

  function gotoPage(n) {
    if (!viewerState.pdf) return;
    const total = viewerState.pdf.numPages;
    viewerState.currentPage = Math.max(1, Math.min(n, total));
    const input = document.getElementById("page-number-input");
    if (input) input.value = viewerState.currentPage;
    renderCurrentPages();
  }

  function setViewMode(mode) {
    viewerState.viewMode = mode;
    const one = document.getElementById("one-page-mode-btn");
    const two = document.getElementById("two-page-mode-btn");
    if (one) one.classList.toggle("active", mode === "one");
    if (two) two.classList.toggle("active", mode === "two");
    renderCurrentPages();
  }

  function setZoom(z) {
    viewerState.zoom = Math.max(0.4, Math.min(z, 3));
    renderCurrentPages();
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  function on(id, ev, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(ev, handler);
  }

  //
  // ─── Team Manual Standard / Engines: backend-required messages ──────────
  //
  window.loadTeamStandardRules = function () {
    const tbody = document.getElementById("team-standard-table-body");
    if (tbody) {
      tbody.innerHTML = `
        <tr><td colspan="99" style="padding:24px;text-align:center;color:#6b7280;font-size:13px;line-height:1.6;">
          <strong>Backend required.</strong><br/>
          Team Manual Standard rules are stored in the local SQLite database and managed by the FastAPI backend.<br/>
          Run <code>run_local.bat</code> in the source folder to enable rule authoring, validation, and migration reports.
        </td></tr>`;
    }
  };

  window.loadEngineStatus = function () {
    const overall = document.getElementById("engine-overall-card");
    const grid = document.getElementById("engine-check-grid");
    if (overall) {
      overall.innerHTML = `
        <div style="padding:16px 20px;text-align:center;color:#6b7280;font-size:13px;line-height:1.6;">
          <strong>Backend required.</strong> Engine readiness (PyMuPDF, Ollama, Team Manual Standard DB, etc.)
          is probed by the FastAPI backend. Start it with <code>run_local.bat</code> to see live status.
        </div>`;
    }
    if (grid) grid.innerHTML = "";
  };

  //
  // ─── utils ──────────────────────────────────────────────────────────────
  //
  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
})();
