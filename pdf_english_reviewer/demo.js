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

  // Subset of the Chicago Manual of Style pilot rules from
  // config/team_standard/chicago_pilot_rules.yaml — enough variety for a
  // realistic-looking mock of the Suggestions panel.
  const CHICAGO_RULES = [
    { key: "one_space_after_sentence", name: "Use one space after sentence-ending punctuation",
      category: "punctuation", severity: "minor",
      message: "Use one space after sentence-ending punctuation.",
      suggestion: "Replace multiple spaces with one space.",
      bad_example: "Close the cover.  Restart the system.",
      good_example: "Close the cover. Restart the system." },
    { key: "serial_comma", name: "Use a serial comma in a simple series",
      category: "punctuation", severity: "minor",
      message: "Consider adding a serial comma before the final item.",
      suggestion: "Add a comma before 'and' or 'or' in a simple series.",
      bad_example: "a controller, a cable and a probe",
      good_example: "a controller, a cable, and a probe" },
    { key: "intro_dependent_clause_comma", name: "Add a comma after an introductory dependent clause",
      category: "grammar", severity: "major",
      message: "The introductory dependent clause may require a comma.",
      suggestion: "Insert a comma at the end of the introductory clause.",
      bad_example: "After the scan is complete select Save.",
      good_example: "After the scan is complete, select Save." },
    { key: "comma_splice", name: "Avoid a comma splice between independent clauses",
      category: "grammar", severity: "major",
      message: "Two independent clauses may not be joined by only a comma.",
      suggestion: "Use a period, semicolon, or a coordinating conjunction.",
      bad_example: "The scan is complete, the result appears.",
      good_example: "The scan is complete, and the result appears." },
    { key: "capitalize_after_colon", name: "Capitalize a complete sentence after a colon",
      category: "capitalization", severity: "minor",
      message: "Capitalize the first word after the colon if it begins a complete sentence.",
      suggestion: "Capitalize the first word after the colon.",
      bad_example: "Note: the stage moves automatically.",
      good_example: "Note: The stage moves automatically." },
    { key: "no_numeral_at_start", name: "Do not begin a sentence with a numeral",
      category: "numbers_abbreviations", severity: "minor",
      message: "Do not begin a sentence with a numeral.",
      suggestion: "Spell out the number or revise the sentence.",
      bad_example: "3 modules are installed in the enclosure.",
      good_example: "Three modules are installed in the enclosure." },
    { key: "leading_zero_decimal", name: "Use a leading zero before a decimal fraction",
      category: "numbers_abbreviations", severity: "minor",
      message: "Add a leading zero before the decimal point.",
      suggestion: "Change .5 to 0.5.",
      bad_example: "Set the gain to .5.",
      good_example: "Set the gain to 0.5." },
    { key: "number_unit_space", name: "Space between number and unit",
      category: "consistency", severity: "minor",
      message: "Technical manuals use a space between numbers and units.",
      suggestion: "Insert a space between the number and the unit.",
      bad_example: "Set the distance to 10mm.",
      good_example: "Set the distance to 10 mm." },
  ];

  const SEVERITY_STYLES = {
    critical: { fill: "rgba(239, 68, 68, 0.30)",  border: "#ef4444", label: "Critical" },
    major:    { fill: "rgba(249, 115, 22, 0.30)", border: "#f97316", label: "Major" },
    minor:    { fill: "rgba(234, 179, 8, 0.35)",  border: "#eab308", label: "Minor" },
  };

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
  const viewerState = { pdf: null, zoom: 1, viewMode: "one", currentPage: 1, filename: "", findings: [], activeFindingId: null };

  async function renderViewer(pdf, name) {
    viewerState.pdf = pdf;
    viewerState.filename = name;
    viewerState.currentPage = 1;
    viewerState.zoom = 1;
    viewerState.viewMode = "one";
    viewerState.findings = [];
    viewerState.activeFindingId = null;

    const upload = document.getElementById("upload-panel");
    const workspace = document.getElementById("workspace");
    if (upload) upload.classList.add("hidden");
    if (!workspace) return;
    workspace.classList.remove("hidden");

    // Populate document header info.
    setText("document-name", name);
    setText("document-meta", `${pdf.numPages} pages · Mock review (Chicago Manual pilot)`);
    setText("review-status", `Generating mock findings…`);
    setText("page-label", `/ ${pdf.numPages}`);
    setText("dictionary-count", "0 terms");

    const pageInput = document.getElementById("page-number-input");
    if (pageInput) {
      pageInput.value = 1;
      pageInput.max = pdf.numPages;
    }

    const ollamaLog = document.getElementById("ollama-log-list");
    if (ollamaLog) ollamaLog.innerHTML = `<span class="hint">Preview mode — Ollama disabled.</span>`;
    const dictList = document.getElementById("dictionary-list");
    if (dictList) dictList.innerHTML = `<span class="hint">Preview mode — glossary requires backend.</span>`;

    wireViewerToolbar();
    wireIssuesFilters();
    wireIssueActions();
    await renderCurrentPages();

    // Generate mock findings in the background so first page paints fast.
    generateMockFindings(pdf).then((findings) => {
      viewerState.findings = findings;
      setText("issue-total", String(findings.length));
      setText("review-status", `Mock review complete — ${findings.length} suggestions from Chicago Manual pilot rules`);
      renderIssuesPanel();
      renderCurrentPages(); // redraw with highlights
    }).catch((err) => {
      console.warn("[demo] mock finding generation failed:", err);
      setText("review-status", "Mock review skipped (text layer unavailable)");
    });
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
      wrap.dataset.page = pageNum;
      wrap.style.cssText = "display:inline-block;margin:12px auto;position:relative;";
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.display = "block";
      canvas.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)";
      canvas.style.background = "#fff";
      wrap.appendChild(canvas);

      const overlay = document.createElement("div");
      overlay.className = "findings-overlay";
      overlay.style.cssText = `position:absolute;left:0;top:0;width:${viewport.width}px;height:${viewport.height}px;pointer-events:none;`;
      wrap.appendChild(overlay);

      const label = document.createElement("div");
      label.textContent = `Page ${pageNum} / ${total}`;
      label.style.cssText = "font-size:11px;color:#6b7280;margin-top:6px;text-align:center;";
      wrap.appendChild(label);
      container.appendChild(wrap);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

      drawFindingsForPage(overlay, pageNum, viewport);
    }
    setText("zoom-label", Math.round(viewerState.zoom * 100) + "%");
  }

  function drawFindingsForPage(overlay, pageNum, viewport) {
    overlay.innerHTML = "";
    const activeCat = getFilterValue("category-filter");
    const findings = viewerState.findings.filter((f) => f.page === pageNum);
    for (const f of findings) {
      if (f.status === "rejected") continue;
      if (activeCat !== "all" && f.category !== activeCat) continue;
      const style = SEVERITY_STYLES[f.severity] || SEVERITY_STYLES.minor;
      // f.bbox stored in unscaled PDF units. Scale to viewport.
      const [px, py, pw, ph] = f.bbox;
      const [vx1, vy1] = viewport.convertToViewportPoint(px, py + ph);
      const [vx2, vy2] = viewport.convertToViewportPoint(px + pw, py);
      const x = Math.min(vx1, vx2);
      const y = Math.min(vy1, vy2);
      const w = Math.abs(vx2 - vx1);
      const h = Math.abs(vy2 - vy1);
      const mark = document.createElement("div");
      mark.dataset.findingId = f.id;
      const isActive = f.id === viewerState.activeFindingId;
      const isAccepted = f.status === "accepted";
      mark.style.cssText = `
        position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;
        background:${isAccepted ? "transparent" : style.fill};
        border:${isActive ? `2px solid ${style.border}` : (isAccepted ? `1px dashed ${style.border}` : "none")};
        border-radius:2px;pointer-events:auto;cursor:pointer;
        transition:background 0.15s, border 0.15s;
      `;
      mark.title = `${style.label} · ${f.ruleName}\n${f.text}`;
      mark.addEventListener("click", () => focusFinding(f.id));
      overlay.appendChild(mark);
    }
  }

  //
  // ─── Mock finding generation ───────────────────────────────────────────
  //
  async function generateMockFindings(pdf) {
    const findings = [];
    const maxPages = Math.min(pdf.numPages, 20);
    // Deterministic per-file: seed from filename
    const seed = hashString(viewerState.filename);
    const rand = mulberry32(seed);

    for (let p = 1; p <= maxPages; p++) {
      const page = await pdf.getPage(p);
      let content;
      try { content = await page.getTextContent(); } catch { continue; }
      const items = content.items.filter((it) => it.str && it.str.trim().length >= 3);
      if (!items.length) continue;
      const numFindings = 2 + Math.floor(rand() * 3); // 2-4 per page
      const picked = new Set();
      for (let i = 0; i < numFindings && picked.size < items.length; i++) {
        let idx;
        do { idx = Math.floor(rand() * items.length); } while (picked.has(idx));
        picked.add(idx);
        const item = items[idx];
        const rule = CHICAGO_RULES[Math.floor(rand() * CHICAGO_RULES.length)];
        const bbox = itemBbox(item);
        findings.push({
          id: newId(),
          page: p,
          ruleKey: rule.key,
          ruleName: rule.name,
          category: rule.category,
          severity: rule.severity,
          text: item.str,
          message: rule.message,
          suggestion: rule.suggestion,
          bad_example: rule.bad_example,
          good_example: rule.good_example,
          bbox,
          status: "pending", // pending | accepted | rejected
          comment: "",
        });
      }
    }
    return findings;
  }

  function itemBbox(item) {
    const tx = item.transform;
    const fontHeight = Math.abs(tx[3] || tx[0] || 12);
    const x = tx[4];
    const y = tx[5];
    const w = item.width || (item.str.length * fontHeight * 0.5);
    const h = fontHeight;
    // PDF coord: y is baseline. Return [x, y_bottom, w, h] in PDF units.
    return [x, y - h * 0.15, w, h * 1.1];
  }

  function hashString(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  //
  // ─── Suggestions panel ─────────────────────────────────────────────────
  //
  let filtersWired = false;
  function wireIssuesFilters() {
    if (filtersWired) return;
    filtersWired = true;
    on("category-filter", "change", renderIssuesPanel);
    on("engine-filter", "change", renderIssuesPanel);
    on("standard-filter", "change", renderIssuesPanel);
  }

  let actionsWired = false;
  function wireIssueActions() {
    if (actionsWired) return;
    actionsWired = true;
    const container = document.getElementById("issues-list");
    if (!container) return;
    container.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-demo-action]");
      if (!btn) {
        const card = e.target.closest("[data-demo-finding-id]");
        if (card && !e.target.matches("button, input")) {
          focusFinding(card.dataset.demoFindingId);
        }
        return;
      }
      e.stopPropagation();
      const id = btn.dataset.demoFindingId;
      const action = btn.dataset.demoAction;
      const f = viewerState.findings.find((x) => x.id === id);
      if (!f) return;
      if (action === "accept") f.status = f.status === "accepted" ? "pending" : "accepted";
      if (action === "reject") f.status = f.status === "rejected" ? "pending" : "rejected";
      renderIssuesPanel();
      renderCurrentPages();
    });
  }

  function getFilterValue(id) {
    const el = document.getElementById(id);
    return (el && el.value) || "all";
  }

  function visibleFindings() {
    const cat = getFilterValue("category-filter");
    return viewerState.findings.filter((f) => cat === "all" || f.category === cat);
  }

  function renderIssuesPanel() {
    const target = document.getElementById("issues-list");
    if (!target) return;
    const list = visibleFindings();
    setText("issue-total", String(list.length));
    if (!list.length) {
      target.innerHTML = `<div class="empty-issues" style="padding:20px;color:#6b7280;">No suggestions match this filter.</div>`;
      return;
    }
    target.innerHTML = list.map((f) => {
      const style = SEVERITY_STYLES[f.severity] || SEVERITY_STYLES.minor;
      const isActive = f.id === viewerState.activeFindingId;
      const statusBadge = f.status === "accepted"
        ? `<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">accepted</span>`
        : f.status === "rejected"
          ? `<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">ignored</span>`
          : `<span style="background:#e5e7eb;color:#374151;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">pending</span>`;
      return `
        <article class="issue-card ${escapeHtml(f.category)}" data-demo-finding-id="${f.id}"
          style="border-left:4px solid ${style.border};${isActive ? "box-shadow:0 0 0 2px rgba(39,103,168,.25);" : ""}">
          <div class="issue-meta" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
            <span class="category" style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(f.category)} · p.${f.page}</span>
            ${statusBadge}
          </div>
          <div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:4px;">${escapeHtml(f.ruleName)}</div>
          <div class="issue-change" style="display:flex;gap:6px;align-items:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;margin:8px 0;">
            <code class="issue-source" style="background:${style.fill};padding:2px 6px;border-radius:3px;">${escapeHtml(f.text)}</code>
            <span style="color:#9ca3af;">→</span>
            <code class="issue-replacement" style="background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:3px;">${escapeHtml(shortSuggestion(f))}</code>
          </div>
          <p class="issue-explanation" style="font-size:12px;color:#4b5563;margin:6px 0;">${escapeHtml(f.message)}</p>
          <div style="font-size:11px;color:#6b7280;margin:6px 0;">
            <div>Example: <span style="color:#dc2626;">${escapeHtml(f.bad_example)}</span> → <span style="color:#059669;">${escapeHtml(f.good_example)}</span></div>
            <div style="margin-top:4px;">Severity: ${style.label} · Rule: Chicago Manual pilot · Key: ${escapeHtml(f.ruleKey)}</div>
          </div>
          <div class="issue-actions" style="display:flex;gap:6px;margin-top:10px;">
            <button class="accept-btn" data-demo-action="accept" data-demo-finding-id="${f.id}"
              style="flex:1;padding:6px 10px;border:1px solid #10b981;background:${f.status === "accepted" ? "#10b981" : "#fff"};color:${f.status === "accepted" ? "#fff" : "#10b981"};border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;">
              ${f.status === "accepted" ? "✓ Accepted" : "Accept"}
            </button>
            <button class="reject-btn" data-demo-action="reject" data-demo-finding-id="${f.id}"
              style="flex:1;padding:6px 10px;border:1px solid #ef4444;background:${f.status === "rejected" ? "#ef4444" : "#fff"};color:${f.status === "rejected" ? "#fff" : "#ef4444"};border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;">
              ${f.status === "rejected" ? "✕ Ignored" : "Ignore"}
            </button>
          </div>
        </article>
      `;
    }).join("");
  }

  function shortSuggestion(f) {
    // Prefer good_example if short, else suggestion.
    if (f.good_example && f.good_example.length <= 40) return f.good_example;
    return f.suggestion.length <= 40 ? f.suggestion : f.suggestion.slice(0, 37) + "…";
  }

  function focusFinding(id) {
    const f = viewerState.findings.find((x) => x.id === id);
    if (!f) return;
    viewerState.activeFindingId = id;
    if (viewerState.currentPage !== f.page) {
      gotoPage(f.page); // triggers rerender
    } else {
      renderCurrentPages();
    }
    renderIssuesPanel();
    // Scroll the active card into view in the sidebar.
    setTimeout(() => {
      const card = document.querySelector(`[data-demo-finding-id="${id}"]`);
      if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
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
