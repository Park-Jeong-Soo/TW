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
  // ─── Reviewer viewer ────────────────────────────────────────────────────
  //
  async function renderViewer(pdf, name) {
    const upload = document.getElementById("upload-panel");
    const workspace = document.getElementById("workspace");
    if (upload) upload.classList.add("hidden");
    if (!workspace) return;
    workspace.classList.remove("hidden");

    const maxPages = Math.min(pdf.numPages, 25);
    workspace.innerHTML = `
      <div style="padding:24px;max-width:1000px;margin:0 auto;">
        <div style="background:#eff6ff;border:1px solid #93c5fd;color:#1e40af;padding:14px 18px;border-radius:10px;margin-bottom:20px;font-size:13px;line-height:1.5;">
          <strong>${escapeHtml(name)}</strong> &middot; ${pdf.numPages} pages<br/>
          Rendered locally in your browser via PDF.js. Saved to your browser's storage (Workspaces tab).
          Review suggestions, glossary, and CSV/PDF exports require running the local FastAPI backend.
        </div>
        <div style="display:flex;gap:12px;margin-bottom:20px;">
          <button id="demo-back-btn" style="padding:8px 16px;border:1px solid #d1d5db;background:#fff;border-radius:8px;cursor:pointer;font-size:13px;">&larr; Upload another PDF</button>
        </div>
        <div id="demo-pages" style="display:flex;flex-direction:column;gap:16px;align-items:center;"></div>
      </div>
    `;

    document.getElementById("demo-back-btn").addEventListener("click", () => {
      workspace.classList.add("hidden");
      if (upload) upload.classList.remove("hidden");
      workspace.innerHTML = "";
    });

    const container = document.getElementById("demo-pages");
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.3 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.maxWidth = "100%";
      canvas.style.height = "auto";
      canvas.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
      canvas.style.background = "#fff";
      canvas.style.borderRadius = "4px";
      container.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
    }
    if (pdf.numPages > maxPages) {
      const note = document.createElement("div");
      note.style.cssText = "padding:16px;color:#6b7280;font-size:13px;text-align:center;";
      note.textContent = `Showing first ${maxPages} of ${pdf.numPages} pages (preview limit).`;
      container.appendChild(note);
    }
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
