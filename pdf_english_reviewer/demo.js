// Client-side preview shim for TW/pdf_english_reviewer.
// - Intercepts PDF upload and renders via PDF.js
// - Saves PDFs to IndexedDB (blob) + localStorage (metadata) → Workspaces tab
// - Runs simple rule matching (typo, spacing) against PDF text layer
// - Excludes text within 2.5cm top/bottom margin (header/footer)
// - Team Manual Standard tab becomes a rule editor (add/edit/delete/toggle)
// - Export PDF report of suggestions via jsPDF

(function () {
  //
  // ─── Config ─────────────────────────────────────────────────────────────
  //
  const PDFJS_VERSION = "3.11.174";
  const PDFJS_SOURCES = [
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build`,
    `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build`,
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`,
  ];
  const JSPDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";

  const WS_STORAGE_KEY = "tw-demo-workspaces-v1";
  const RULES_STORAGE_KEY = "tw-demo-rules-v4";
  const IDB_NAME = "tw-demo-pdf-store";
  const IDB_STORE = "pdfs";

  // 2.5 cm margin (top and bottom) excluded from review — headers/footers.
  const MARGIN_CM = 2.5;
  const MARGIN_PT = MARGIN_CM * 72 / 2.54; // ≈ 70.87 pt

  // Chicago rules declared later; forward reference resolved by defining
  // DEFAULT_RULES via a function call after CHICAGO_RULES.
  let DEFAULT_RULES; // filled after CHICAGO_RULES declaration
  const _BASE_RULES = [
    // Common English typos.
    { id: "typo-teh",     category: "typo", name: "teh → the",           pattern: "\\bteh\\b",        flags: "gi", replacement: "the",     severity: "minor", enabled: true },
    { id: "typo-adress",  category: "typo", name: "adress → address",    pattern: "\\badress\\b",     flags: "gi", replacement: "address", severity: "minor", enabled: true },
    { id: "typo-recieve", category: "typo", name: "recieve → receive",   pattern: "\\brecieve\\b",    flags: "gi", replacement: "receive", severity: "minor", enabled: true },
    { id: "typo-seperate",category: "typo", name: "seperate → separate", pattern: "\\bseperate\\b",   flags: "gi", replacement: "separate",severity: "minor", enabled: true },
    { id: "typo-occured", category: "typo", name: "occured → occurred",  pattern: "\\boccured\\b",    flags: "gi", replacement: "occurred",severity: "minor", enabled: true },
    { id: "typo-untill",  category: "typo", name: "untill → until",      pattern: "\\buntill\\b",     flags: "gi", replacement: "until",   severity: "minor", enabled: true },
    { id: "typo-alot",    category: "typo", name: "alot → a lot",        pattern: "\\balot\\b",       flags: "gi", replacement: "a lot",   severity: "minor", enabled: true },
    { id: "typo-thier",   category: "typo", name: "thier → their",       pattern: "\\bthier\\b",      flags: "gi", replacement: "their",   severity: "minor", enabled: true },
    // Spacing.
    { id: "space-unit",   category: "spacing", name: "Number-unit spacing", pattern: "\\b(\\d+(?:\\.\\d+)?)(mm|cm|m|km|kg|g|mg|V|A|Hz|kHz|MHz|GHz|MPa|kPa|Pa|nm|um|μm|W|kW|s|ms|us|μs|ns)\\b", flags: "g", replacement: "$1 $2", severity: "minor", enabled: true },
    { id: "space-double", category: "spacing", name: "Double space",        pattern: "  +",             flags: "g", replacement: " ", severity: "minor", enabled: true },
  ];

  const SEVERITY_STYLES = {
    critical: { fill: "rgba(239, 68, 68, 0.30)",  border: "#ef4444", label: "Critical" },
    major:    { fill: "rgba(249, 115, 22, 0.30)", border: "#f97316", label: "Major" },
    minor:    { fill: "rgba(234, 179, 8, 0.35)",  border: "#eab308", label: "Minor" },
  };
  const CATEGORY_COLORS = {
    typo: "#f59e0b", spacing: "#3b82f6", custom: "#8b5cf6",
    punctuation: "#0ea5e9", grammar: "#a855f7", capitalization: "#14b8a6",
    numbers_abbreviations: "#f43f5e", hyphenation_terminology: "#eab308",
  };

  // 20 representative Chicago Manual of Style rules (pilot).
  // Regex-implementable rules are enabled by default; NLP/parser/context-only
  // rules are added as disabled with a placeholder pattern so users see them
  // in the editor and can enable or refine.
  const CHICAGO_RULES = [
    { id: "chicago-01-double-space",   category: "punctuation", name: "Chicago 6.7 — One space after sentence-ending punctuation",
      pattern: "([.!?])  +", flags: "g", replacement: "$1 ", severity: "minor", enabled: true },
    { id: "chicago-02-serial-comma",   category: "punctuation", name: "Chicago 6.19 — Serial (Oxford) comma",
      pattern: "(\\w+),\\s+(\\w+)\\s+(and|or)\\s+(\\w+)", flags: "g", replacement: "$1, $2, $3 $4", severity: "minor", enabled: false },
    { id: "chicago-03-intro-clause",   category: "grammar", name: "Chicago 6.26 — Comma after introductory dependent clause",
      pattern: "^(After|Before|When|If|Although|While|Because|Since|Unless)\\s+[\\w\\s]{5,60}\\s+([A-Z]\\w+)", flags: "gm", replacement: "$1, $2", severity: "major", enabled: false },
    { id: "chicago-04-comma-splice",   category: "grammar", name: "Chicago 6.23 — Comma splice between independent clauses (heuristic)",
      pattern: "\\b(is|are|was|were|has|have|had|will)\\s+\\w+[^.!?]{0,60},\\s+(it|this|that|these|those|they|we|you|he|she)\\s+(is|are|was|were|has|have|had|will)\\b",
      flags: "gi", replacement: ". (start new sentence)", severity: "major", enabled: false },
    { id: "chicago-05-cap-after-colon",category: "capitalization", name: "Chicago 6.63 — Capitalize a complete sentence after a colon",
      pattern: ":\\s+([a-z])", flags: "g", replacement: ": (capitalize)", severity: "minor", enabled: false },
    { id: "chicago-08-define-abbrev",  category: "numbers_abbreviations", name: "Chicago 10.3 — Define unfamiliar abbreviation at first use (heuristic)",
      pattern: "\\b([A-Z]{3,6})\\b(?!\\s*\\()",
      flags: "g", replacement: "$1 (define at first use)", severity: "minor", enabled: false },
    { id: "chicago-10-list-punct",     category: "punctuation", name: "Chicago 6.130 — List items with inconsistent punctuation (heuristic)",
      pattern: "(^|\\n)\\s*[-•*]\\s+[a-z]",
      flags: "gm", replacement: "$&", severity: "minor", enabled: false },
    { id: "chicago-11-hyphen-modifier",category: "hyphenation_terminology", name: "Chicago 7.85 — Hyphenate compound modifier before noun (heuristic)",
      pattern: "\\b(high|low|long|short|full|part|real|multi|open|closed|wide|narrow|fine|coarse)\\s+(speed|resolution|term|scale|frequency|time|source|purpose|loop|range|band|precision|grained)\\s+(\\w+)",
      flags: "gi", replacement: "$1-$2 $3", severity: "minor", enabled: false },
    { id: "chicago-12-no-hyphen-ly",   category: "hyphenation_terminology", name: "Chicago 7.86 — Do not hyphenate an -ly adverb compound",
      pattern: "\\b(\\w+ly)-(\\w+)", flags: "g", replacement: "$1 $2", severity: "minor", enabled: true },
    { id: "chicago-13-suspended-hyphen",category:"hyphenation_terminology", name: "Chicago 7.88 — Suspended hyphens in shared compounds (heuristic)",
      pattern: "\\b(low|high|short|long|left|right|up|down)\\s+and\\s+(low|high|short|long|left|right|up|down)-(\\w+)",
      flags: "gi", replacement: "$1- and $2-$3", severity: "minor", enabled: false },
    { id: "chicago-14-consistent-compound",category: "hyphenation_terminology", name: "Chicago 7.89 — Dual-form compound term (review consistency)",
      pattern: "\\b(e-?mail|log-?in|set-?up|start-?up|real-?time|on-?line|web-?site|micro-?controller|drop-?down|check-?box|multi-?task)\\b",
      flags: "gi", replacement: "$1", severity: "minor", enabled: false },
    { id: "chicago-15-ui-capitalization",category: "hyphenation_terminology", name: "Chicago 8.155 — UI action word capitalization (heuristic)",
      pattern: "\\b(click|press|select|tap|choose)\\s+(ok|cancel|submit|apply|save|delete|close|reset|next|previous|back|help|open|edit)\\b",
      flags: "g", replacement: "$1 (capitalize $2)", severity: "minor", enabled: false },
    { id: "chicago-16-subject-verb",   category: "grammar", name: "Chicago 5.140 — Subject-verb agreement (heuristic)",
      pattern: "\\b(they|we|you|these|those)\\s+(is|has|was)\\b|\\b(he|she|it|this|that)\\s+(are|have|were)\\b",
      flags: "gi", replacement: "(check verb form)", severity: "major", enabled: false },
    { id: "chicago-17-pronoun-agree",  category: "grammar", name: "Chicago 5.30 — Pronoun-antecedent agreement (heuristic)",
      pattern: "\\b(each|every|either|neither)\\s+\\w+(?:\\s+\\w+)?\\s+(they|their|them)\\b",
      flags: "gi", replacement: "(consider singular pronoun)", severity: "major", enabled: false },
    { id: "chicago-18-dangling",       category: "grammar", name: "Chicago 5.115 — Dangling participial phrase (heuristic)",
      pattern: "^(While|After|Before|When|Having|Being|Using|Considering|Following)\\s+\\w+ing\\s+[\\w\\s]{3,40},\\s+(the|it|this|these|that)\\s+\\w+",
      flags: "gm", replacement: "$&", severity: "major", enabled: false },
    { id: "chicago-19-tense",          category: "grammar", name: "Chicago 5.132 — Mixed verb tense (heuristic)",
      pattern: "\\b(will|shall)\\s+\\w+\\b[^.!?]{0,50}\\b(was|were|had)\\b",
      flags: "gi", replacement: "(use consistent tense)", severity: "minor", enabled: false },
    { id: "chicago-20-parallel-lists", category: "grammar", name: "Chicago 6.130 — Non-parallel list items (heuristic)",
      pattern: "(?:^|\\n)\\s*\\d+\\.\\s+\\w+ing\\b[^\\n]*\\n\\s*\\d+\\.\\s+(?!\\w+ing\\b)[A-Za-z]\\w+",
      flags: "gm", replacement: "(use parallel forms)", severity: "minor", enabled: false },
  ];
  DEFAULT_RULES = [..._BASE_RULES, ...CHICAGO_RULES];

  //
  // ─── PDF.js loader ─────────────────────────────────────────────────────
  //
  let pdfjsReady = null;
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
        } catch (err) { lastErr = err; console.warn("[demo] PDF.js load failed from", base, err); }
      }
      throw lastErr || new Error("All PDF.js CDNs failed");
    })();
    return pdfjsReady;
  }
  ensurePdfjs().catch((err) => console.warn("[demo] PDF.js preload failed:", err));

  let jspdfReady = null;
  async function ensureJsPdf() {
    if (jspdfReady) return jspdfReady;
    jspdfReady = loadScript(JSPDF_URL);
    return jspdfReady;
  }

  //
  // ─── IndexedDB (PDF blobs) ─────────────────────────────────────────────
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
  // ─── Workspace metadata (localStorage) ─────────────────────────────────
  //
  function readWorkspaces() {
    try { return JSON.parse(localStorage.getItem(WS_STORAGE_KEY) || "[]"); }
    catch { return []; }
  }
  function writeWorkspaces(list) { localStorage.setItem(WS_STORAGE_KEY, JSON.stringify(list)); }
  function addWorkspaceMeta(meta) { const list = readWorkspaces(); list.unshift(meta); writeWorkspaces(list); }
  function removeWorkspaceMeta(id) { writeWorkspaces(readWorkspaces().filter((w) => w.id !== id)); }

  function newId() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  //
  // ─── Rules storage (localStorage) ──────────────────────────────────────
  //
  function getRules() {
    try {
      const raw = localStorage.getItem(RULES_STORAGE_KEY);
      if (!raw) return DEFAULT_RULES.slice();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_RULES.slice();
    } catch { return DEFAULT_RULES.slice(); }
  }
  function saveRules(rules) { localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules)); }
  function upsertRule(rule) {
    const list = getRules();
    const idx = list.findIndex((r) => r.id === rule.id);
    if (idx >= 0) list[idx] = rule; else list.push(rule);
    saveRules(list);
  }
  function deleteRuleId(id) { saveRules(getRules().filter((r) => r.id !== id)); }
  function resetRules() { localStorage.removeItem(RULES_STORAGE_KEY); }

  //
  // ─── Upload form intercept (capture phase) ─────────────────────────────
  //
  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!form || form.id !== "upload-form") return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const fileInput = document.getElementById("pdf-file");
    const projectInput = document.getElementById("project-name");
    const reviewerInput = document.getElementById("reviewer");
    const file = fileInput && fileInput.files && fileInput.files[0];
    const btn = form.querySelector('button[type="submit"]');
    if (!file) { alert("Please choose a PDF file first."); return; }
    if (btn) { btn.disabled = true; btn.textContent = "Rendering preview…"; }
    try {
      await ensurePdfjs();
      const buffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
      const id = newId();
      try {
        await idbPut(id, new Blob([buffer], { type: "application/pdf" }));
        addWorkspaceMeta({
          id, filename: file.name,
          project_name: (projectInput && projectInput.value) || "",
          reviewer: (reviewerInput && reviewerInput.value) || "",
          page_count: pdf.numPages, size_bytes: file.size,
          created_at: new Date().toISOString(),
        });
      } catch (storeErr) { console.warn("[demo] persist failed:", storeErr); }
      await renderViewer(pdf, file.name);
    } catch (err) {
      console.error("[demo] PDF render failed:", err);
      alert("PDF render failed: " + (err && err.message ? err.message : err));
    } finally { if (btn) { btn.disabled = false; btn.textContent = "Open review workspace"; } }
  }, true);

  //
  // ─── Workspaces list ───────────────────────────────────────────────────
  //
  window.loadWorkspaces = renderSavedWorkspaces;
  function renderSavedWorkspaces() {
    const container = document.getElementById("workspace-list");
    if (!container) return;
    const searchInput = document.getElementById("workspace-search");
    const query = (searchInput && searchInput.value.trim().toLowerCase()) || "";
    const list = readWorkspaces().filter((item) =>
      item.filename.toLowerCase().includes(query) ||
      (item.project_name || "").toLowerCase().includes(query));
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
      </article>`).join("");
    container.querySelectorAll("[data-demo-open]").forEach((b) =>
      b.addEventListener("click", () => openSavedWorkspace(b.dataset.demoOpen)));
    container.querySelectorAll("[data-demo-delete]").forEach((b) =>
      b.addEventListener("click", () => deleteSavedWorkspace(b.dataset.demoDelete)));
  }
  async function openSavedWorkspace(id) {
    const meta = readWorkspaces().find((w) => w.id === id);
    if (!meta) return alert("Workspace metadata missing.");
    try {
      const blob = await idbGet(id);
      if (!blob) return alert("Stored PDF blob not found.");
      await ensurePdfjs();
      const buffer = await blob.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
      if (typeof window.showView === "function") window.showView("reviewer");
      await renderViewer(pdf, meta.filename);
    } catch (err) { alert("Could not reopen workspace: " + err.message); }
  }
  async function deleteSavedWorkspace(id) {
    const meta = readWorkspaces().find((w) => w.id === id);
    if (!meta) return;
    if (!confirm(`Delete this workspace?\n\n${meta.filename}`)) return;
    try { await idbDelete(id); } catch (err) { console.warn("[demo] IDB delete failed:", err); }
    removeWorkspaceMeta(id);
    renderSavedWorkspaces();
  }
  document.addEventListener("input", (event) => {
    if (event.target && event.target.id === "workspace-search") renderSavedWorkspaces();
  }, true);

  //
  // ─── Reviewer state ────────────────────────────────────────────────────
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

    setText("document-name", name);
    setText("document-meta", `${pdf.numPages} pages · Preview mode (header/footer 2.5cm excluded)`);
    setText("review-status", "Extracting text and matching rules…");
    setText("page-label", `/ ${pdf.numPages}`);
    setText("dictionary-count", "0 terms");

    const pageInput = document.getElementById("page-number-input");
    if (pageInput) { pageInput.value = 1; pageInput.max = pdf.numPages; }

    const ollamaLog = document.getElementById("ollama-log-list");
    if (ollamaLog) ollamaLog.innerHTML = `<span class="hint">Preview mode — Ollama disabled.</span>`;
    const dictList = document.getElementById("dictionary-list");
    if (dictList) dictList.innerHTML = `<span class="hint">Preview mode — glossary requires backend.</span>`;

    hideUnusedSidebarSections();
    wireDocumentDataButtons();
    wireViewerToolbar();
    wireIssuesFilters();
    wireIssueActions();
    setupExportButton();
    await renderCurrentPages();

    runRulesOnPdf(pdf).then((findings) => {
      viewerState.findings = findings;
      setText("issue-total", String(findings.length));
      const cnt = findings.length;
      setText("review-status", cnt
        ? `Review complete — ${cnt} suggestion${cnt === 1 ? "" : "s"} from ${getRules().filter((r) => r.enabled).length} enabled rules`
        : `Review complete — no matches found`);
      renderIssuesPanel();
      renderCurrentPages();
    }).catch((err) => {
      console.warn("[demo] rule run failed:", err);
      setText("review-status", "Rule matching failed (see console).");
    });
  }

  //
  // ─── Rule matching over PDF text ───────────────────────────────────────
  //
  async function runRulesOnPdf(pdf) {
    const rules = getRules().filter((r) => r.enabled);
    if (!rules.length) return [];
    const compiled = rules.map((r) => {
      try { return { rule: r, re: new RegExp(r.pattern, r.flags || "g") }; }
      catch { return null; }
    }).filter(Boolean);

    const findings = [];
    const maxPages = Math.min(pdf.numPages, 50);
    for (let p = 1; p <= maxPages; p++) {
      const page = await pdf.getPage(p);
      const pageHeight = page.view[3]; // [x0, y0, x1, y1]
      let content;
      try { content = await page.getTextContent(); } catch { continue; }
      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue;
        const bbox = itemBbox(item);
        // Header/footer margin filter: PDF coord y from bottom.
        // Skip if item's bottom is below MARGIN_PT (bottom margin)
        // or item's top is above pageHeight - MARGIN_PT (top margin).
        const yBottom = bbox[1];
        const yTop = bbox[1] + bbox[3];
        if (yBottom < MARGIN_PT) continue;                    // in bottom footer
        if (yTop > pageHeight - MARGIN_PT) continue;          // in top header

        for (const { rule, re } of compiled) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(item.str)) !== null) {
            const matchText = m[0];
            const replacement = applyReplacement(rule.replacement, m);
            findings.push({
              id: newId(),
              page: p,
              ruleId: rule.id,
              ruleName: rule.name,
              category: rule.category,
              severity: rule.severity,
              text: matchText,
              context: item.str,
              suggestion: replacement,
              bbox: bboxSlice(item, m.index, matchText.length, bbox),
              status: "pending",
            });
            if (!re.global) break;
          }
        }
      }
    }
    return findings;
  }

  function applyReplacement(template, match) {
    if (!template) return "";
    return template.replace(/\$(\d+)/g, (_, n) => match[Number(n)] || "");
  }

  function itemBbox(item) {
    const tx = item.transform;
    const fontHeight = Math.abs(tx[3] || tx[0] || 12);
    const x = tx[4];
    const y = tx[5];
    const w = item.width || (item.str.length * fontHeight * 0.5);
    return [x, y - fontHeight * 0.15, w, fontHeight * 1.1];
  }
  function bboxSlice(item, startIdx, len, fullBbox) {
    if (!item.str.length) return fullBbox;
    const charW = fullBbox[2] / item.str.length;
    return [fullBbox[0] + startIdx * charW, fullBbox[1], Math.max(charW * len, charW), fullBbox[3]];
  }

  //
  // ─── Page rendering with highlight overlay ─────────────────────────────
  //
  async function renderCurrentPages() {
    const container = document.getElementById("pdf-document");
    if (!container || !viewerState.pdf) return;
    container.innerHTML = "";
    const pdf = viewerState.pdf;
    const total = pdf.numPages;
    const pages = viewerState.viewMode === "two"
      ? [viewerState.currentPage, viewerState.currentPage + 1].filter((n) => n >= 1 && n <= total)
      : [viewerState.currentPage];

    for (const pageNum of pages) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.3 * viewerState.zoom });
      const wrap = document.createElement("div");
      wrap.className = "pdf-page-wrap";
      wrap.dataset.page = pageNum;
      wrap.style.cssText = "display:inline-block;margin:12px auto;position:relative;";
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width; canvas.height = viewport.height;
      canvas.style.display = "block"; canvas.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)"; canvas.style.background = "#fff";
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
      const [px, py, pw, ph] = f.bbox;
      const [vx1, vy1] = viewport.convertToViewportPoint(px, py + ph);
      const [vx2, vy2] = viewport.convertToViewportPoint(px + pw, py);
      const x = Math.min(vx1, vx2), y = Math.min(vy1, vy2);
      const w = Math.abs(vx2 - vx1), h = Math.abs(vy2 - vy1);
      const isActive = f.id === viewerState.activeFindingId;
      const isAccepted = f.status === "accepted";
      const mark = document.createElement("div");
      mark.dataset.findingId = f.id;
      mark.style.cssText = `
        position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;
        background:${isAccepted ? "transparent" : style.fill};
        border:${isActive ? `2px solid ${style.border}` : (isAccepted ? `1px dashed ${style.border}` : "none")};
        border-radius:2px;pointer-events:auto;cursor:pointer;transition:all 0.15s;`;
      mark.title = `${style.label} · ${f.ruleName}\n${f.text} → ${f.suggestion || "review"}`;
      mark.addEventListener("click", () => focusFinding(f.id));
      overlay.appendChild(mark);
    }
  }

  //
  // ─── Left sidebar cleanup ──────────────────────────────────────────────
  // Hide everything except the Document data card (per user request).
  //
  function hideUnusedSidebarSections() {
    const sidebar = document.querySelector(".left-sidebar");
    if (!sidebar) return;
    const hide = (sel) => sidebar.querySelectorAll(sel).forEach((el) => (el.style.display = "none"));
    hide(".doc-info");
    hide(".run-review-card");
    // Only hide the Applied Glossary dictionary card, keep the Document Data one.
    sidebar.querySelectorAll(".dictionary-card").forEach((el) => {
      if (!el.classList.contains("document-data-card")) el.style.display = "none";
    });
    // Add a compact document header at the top of the sidebar.
    const dataCard = sidebar.querySelector(".document-data-card");
    if (dataCard && !document.getElementById("demo-doc-header")) {
      const header = document.createElement("div");
      header.id = "demo-doc-header";
      header.style.cssText = "padding:12px 14px;margin-bottom:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;";
      header.innerHTML = `
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;margin:0 0 4px;">Current document</p>
        <h3 id="demo-doc-name" style="font-size:14px;font-weight:600;color:#111827;margin:0 0 4px;word-break:break-all;"></h3>
        <p id="demo-doc-meta" style="font-size:12px;color:#6b7280;margin:0;"></p>`;
      dataCard.parentNode.insertBefore(header, dataCard);
    }
    setText("demo-doc-name", viewerState.filename);
    setText("demo-doc-meta", `${viewerState.pdf.numPages} pages · header/footer 2.5 cm excluded`);
  }

  let docDataWired = false;
  function wireDocumentDataButtons() {
    if (docDataWired) return;
    docDataWired = true;
    const card = document.querySelector(".document-data-card");
    if (!card) return;
    card.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-delete-document]");
      if (!btn) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const target = btn.dataset.deleteDocument;
      if (target === "review-results") {
        if (!confirm("Clear all review results for this session?")) return;
        viewerState.findings = [];
        setText("issue-total", "0");
        setText("review-status", "Review results cleared");
        renderIssuesPanel();
        renderCurrentPages();
        return;
      }
      if (target === "generated-files") {
        alert("No generated files in preview mode (annotated PDF/CSV export are backend features). Use Export PDF Report from the top bar for a suggestion summary.");
        return;
      }
      if (target === "original" || target === "all") {
        if (!confirm("Delete this workspace and return to upload?")) return;
        const wsList = readWorkspaces();
        const meta = wsList.find((w) => w.filename === viewerState.filename);
        if (meta) {
          try { await idbDelete(meta.id); } catch {}
          removeWorkspaceMeta(meta.id);
        }
        viewerState.pdf = null;
        viewerState.findings = [];
        const upload = document.getElementById("upload-panel");
        const workspace = document.getElementById("workspace");
        if (workspace) workspace.classList.add("hidden");
        if (upload) upload.classList.remove("hidden");
      }
    }, true); // capture: bypass app_v3.js handlers
  }

  //
  // ─── Toolbar wiring ────────────────────────────────────────────────────
  //
  let viewerWired = false;
  function wireViewerToolbar() {
    if (viewerWired) return;
    viewerWired = true;
    on("previous-page-btn", "click", () => gotoPage(viewerState.currentPage - 1));
    on("next-page-btn", "click", () => gotoPage(viewerState.currentPage + step()));
    on("page-number-input", "change", (e) => gotoPage(parseInt(e.target.value, 10) || 1));
    on("one-page-mode-btn", "click", () => setViewMode("one"));
    on("two-page-mode-btn", "click", () => setViewMode("two"));
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
  function setZoom(z) { viewerState.zoom = Math.max(0.4, Math.min(z, 3)); renderCurrentPages(); }

  //
  // ─── Suggestions panel ────────────────────────────────────────────────
  //
  let filtersWired = false;
  function wireIssuesFilters() {
    if (filtersWired) return;
    filtersWired = true;
    // Rebuild category filter to only expose our categories.
    const catSel = document.getElementById("category-filter");
    if (catSel) {
      catSel.innerHTML = `
        <option value="all">All categories</option>
        <option value="typo">Typo</option>
        <option value="spacing">Spacing</option>
        <option value="punctuation">Punctuation</option>
        <option value="grammar">Grammar</option>
        <option value="capitalization">Capitalization</option>
        <option value="numbers_abbreviations">Numbers &amp; abbreviations</option>
        <option value="hyphenation_terminology">Hyphenation &amp; terminology</option>
        <option value="custom">Custom</option>`;
    }
    on("category-filter", "change", () => { renderIssuesPanel(); renderCurrentPages(); });
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
        if (card && !e.target.matches("button, input")) focusFinding(card.dataset.demoFindingId);
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
  function getFilterValue(id) { const el = document.getElementById(id); return (el && el.value) || "all"; }
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
      const catColor = CATEGORY_COLORS[f.category] || "#6b7280";
      return `
        <article class="issue-card" data-demo-finding-id="${f.id}"
          style="border-left:4px solid ${style.border};${isActive ? "box-shadow:0 0 0 2px rgba(39,103,168,.25);" : ""}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:11px;color:${catColor};text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${escapeHtml(f.category)} · p.${f.page}</span>
            ${statusBadge}
          </div>
          <div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:6px;">${escapeHtml(f.ruleName)}</div>
          <div style="display:flex;gap:6px;align-items:center;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;margin:6px 0;flex-wrap:wrap;">
            <code style="background:${style.fill};padding:2px 6px;border-radius:3px;">${escapeHtml(f.text)}</code>
            <span style="color:#9ca3af;">→</span>
            <code style="background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:3px;">${escapeHtml(f.suggestion || "review")}</code>
          </div>
          <div style="font-size:11px;color:#6b7280;margin-top:6px;">Context: <em>…${escapeHtml(truncate(f.context, 80))}…</em></div>
          <div style="display:flex;gap:6px;margin-top:10px;">
            <button data-demo-action="accept" data-demo-finding-id="${f.id}"
              style="flex:1;padding:6px 10px;border:1px solid #10b981;background:${f.status === "accepted" ? "#10b981" : "#fff"};color:${f.status === "accepted" ? "#fff" : "#10b981"};border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;">
              ${f.status === "accepted" ? "✓ Accepted" : "Accept"}
            </button>
            <button data-demo-action="reject" data-demo-finding-id="${f.id}"
              style="flex:1;padding:6px 10px;border:1px solid #ef4444;background:${f.status === "rejected" ? "#ef4444" : "#fff"};color:${f.status === "rejected" ? "#fff" : "#ef4444"};border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;">
              ${f.status === "rejected" ? "✕ Ignored" : "Ignore"}
            </button>
          </div>
        </article>`;
    }).join("");
  }
  function truncate(s, n) { return s.length <= n ? s : s.slice(0, n); }
  function focusFinding(id) {
    const f = viewerState.findings.find((x) => x.id === id);
    if (!f) return;
    viewerState.activeFindingId = id;
    if (viewerState.currentPage !== f.page) gotoPage(f.page);
    else renderCurrentPages();
    renderIssuesPanel();
    setTimeout(() => {
      const card = document.querySelector(`[data-demo-finding-id="${id}"]`);
      if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
  }

  //
  // ─── Export PDF report ────────────────────────────────────────────────
  //
  function setupExportButton() {
    const btn = document.getElementById("download-pdf-btn");
    if (!btn) return;
    btn.classList.remove("hidden");
    btn.textContent = "Export PDF Report";
    if (btn.dataset.demoWired) return;
    btn.dataset.demoWired = "1";
    btn.addEventListener("click", exportReport);
  }

  async function exportReport() {
    if (!viewerState.findings.length) { alert("No suggestions to export."); return; }
    try {
      await ensureJsPdf();
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const marginX = 40, marginTop = 50;
      let y = marginTop;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      doc.setFont("helvetica", "bold"); doc.setFontSize(16);
      doc.text("PDF English Reviewer — Suggestions Report", marginX, y); y += 22;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(120);
      doc.text(`File: ${viewerState.filename}`, marginX, y); y += 14;
      doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, y); y += 14;

      const total = viewerState.findings.length;
      const accepted = viewerState.findings.filter((f) => f.status === "accepted").length;
      const rejected = viewerState.findings.filter((f) => f.status === "rejected").length;
      const pending = total - accepted - rejected;
      doc.text(`Total: ${total} · Accepted: ${accepted} · Ignored: ${rejected} · Pending: ${pending}`, marginX, y);
      y += 22;

      doc.setTextColor(0);
      const findings = viewerState.findings.slice().sort((a, b) => a.page - b.page);
      for (let i = 0; i < findings.length; i++) {
        const f = findings[i];
        if (y > pageHeight - 80) { doc.addPage(); y = marginTop; }
        const style = SEVERITY_STYLES[f.severity] || SEVERITY_STYLES.minor;
        // severity color bar
        const [r, g, b] = hexToRgb(style.border);
        doc.setFillColor(r, g, b);
        doc.rect(marginX, y - 8, 3, 44, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(0);
        doc.text(`${i + 1}. ${f.ruleName}`, marginX + 10, y);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(100);
        doc.text(`Page ${f.page} · ${f.category} · ${style.label} · ${f.status}`, marginX + 10, y + 12);
        doc.setTextColor(0);
        const before = `Before: "${f.text}"`;
        const after = `Suggest: "${f.suggestion || "(review manually)"}"`;
        doc.text(before, marginX + 10, y + 26, { maxWidth: pageWidth - marginX * 2 - 10 });
        doc.text(after, marginX + 10, y + 38, { maxWidth: pageWidth - marginX * 2 - 10 });
        y += 56;
      }
      const safeName = viewerState.filename.replace(/\.pdf$/i, "").replace(/[^\w.-]+/g, "_");
      doc.save(`${safeName}_review_report.pdf`);
    } catch (err) {
      console.error("[demo] export failed:", err);
      alert("Export failed: " + err.message);
    }
  }
  function hexToRgb(hex) {
    const m = /^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i.exec(hex);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
  }

  //
  // ─── Team Manual Standard tab → Rule editor ───────────────────────────
  //
  window.loadTeamStandardRules = renderRuleEditor;

  function renderRuleEditor() {
    const view = document.getElementById("team-standard-view");
    if (!view) return;
    const rules = getRules();
    view.innerHTML = `
      <div class="page-shell" style="max-width:1100px;margin:0 auto;padding:24px;">
        <div class="page-heading" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div>
            <p class="eyebrow">RULE EDITOR (DB)</p>
            <h2>Team Manual Standard</h2>
            <p style="color:#6b7280;font-size:13px;">Add, edit, or remove rules used by the reviewer. Stored in your browser's localStorage.</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="primary" id="rule-add-btn">+ Add Rule</button>
            <button class="secondary" id="rule-export-btn">Export JSON</button>
            <button class="secondary" id="rule-import-btn">Import JSON</button>
            <button class="danger" id="rule-reset-btn">Reset Defaults</button>
          </div>
        </div>
        <div style="background:#eff6ff;border:1px solid #93c5fd;color:#1e40af;padding:12px 16px;border-radius:8px;font-size:12px;margin-bottom:16px;line-height:1.5;">
          <strong>How it works:</strong> Each rule uses a JavaScript regular expression tested against text extracted from the PDF (excluding the top and bottom ${MARGIN_CM} cm). Matches appear as highlighted findings. Use <code>$1</code>, <code>$2</code>… in the replacement to reference capture groups.
        </div>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:13px;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb;">On</th>
              <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb;">Category</th>
              <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb;">Name</th>
              <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb;">Pattern (regex)</th>
              <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb;">Replacement</th>
              <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb;">Severity</th>
              <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb;">Actions</th>
            </tr>
          </thead>
          <tbody id="rule-tbody">
            ${rules.map(renderRuleRow).join("")}
          </tbody>
        </table>
        <input type="file" id="rule-import-file" accept="application/json" style="display:none;" />
      </div>
      <div id="rule-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000;align-items:center;justify-content:center;padding:20px;"></div>
    `;
    wireRuleEditor();
  }

  function renderRuleRow(r) {
    return `
      <tr data-rule-id="${r.id}" style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:8px;"><input type="checkbox" data-rule-toggle ${r.enabled ? "checked" : ""} /></td>
        <td style="padding:8px;"><span style="background:${CATEGORY_COLORS[r.category] || "#6b7280"};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;">${escapeHtml(r.category)}</span></td>
        <td style="padding:8px;font-weight:500;">${escapeHtml(r.name)}</td>
        <td style="padding:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#374151;">${escapeHtml(r.pattern)}</td>
        <td style="padding:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#059669;">${escapeHtml(r.replacement || "—")}</td>
        <td style="padding:8px;"><span style="color:${(SEVERITY_STYLES[r.severity] || SEVERITY_STYLES.minor).border};font-weight:600;font-size:12px;">${escapeHtml(r.severity)}</span></td>
        <td style="padding:8px;text-align:right;">
          <button data-rule-edit style="padding:4px 10px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;font-size:12px;margin-right:4px;">Edit</button>
          <button data-rule-delete style="padding:4px 10px;border:1px solid #ef4444;background:#fff;color:#ef4444;border-radius:6px;cursor:pointer;font-size:12px;">Delete</button>
        </td>
      </tr>`;
  }

  function wireRuleEditor() {
    document.getElementById("rule-add-btn").addEventListener("click", () => openRuleModal(null));
    document.getElementById("rule-reset-btn").addEventListener("click", () => {
      if (!confirm("Reset to default rules? Your custom rules will be removed.")) return;
      resetRules();
      renderRuleEditor();
    });
    document.getElementById("rule-export-btn").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(getRules(), null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "review_rules.json"; a.click();
      URL.revokeObjectURL(url);
    });
    document.getElementById("rule-import-btn").addEventListener("click", () => {
      document.getElementById("rule-import-file").click();
    });
    document.getElementById("rule-import-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error("Expected an array of rules.");
        saveRules(parsed);
        renderRuleEditor();
        alert(`Imported ${parsed.length} rules.`);
      } catch (err) { alert("Import failed: " + err.message); }
      e.target.value = "";
    });

    const tbody = document.getElementById("rule-tbody");
    tbody.addEventListener("click", (e) => {
      const row = e.target.closest("[data-rule-id]");
      if (!row) return;
      const id = row.dataset.ruleId;
      if (e.target.matches("[data-rule-edit]")) openRuleModal(getRules().find((r) => r.id === id));
      if (e.target.matches("[data-rule-delete]")) {
        if (!confirm("Delete this rule?")) return;
        deleteRuleId(id); renderRuleEditor();
      }
    });
    tbody.addEventListener("change", (e) => {
      if (!e.target.matches("[data-rule-toggle]")) return;
      const row = e.target.closest("[data-rule-id]");
      const id = row.dataset.ruleId;
      const rule = getRules().find((r) => r.id === id);
      if (rule) { rule.enabled = e.target.checked; upsertRule(rule); }
    });
  }

  function openRuleModal(existing) {
    const modal = document.getElementById("rule-modal");
    const r = existing || { id: "custom-" + Date.now(), category: "custom", name: "", pattern: "", flags: "g", replacement: "", severity: "minor", enabled: true };
    modal.style.display = "flex";
    modal.innerHTML = `
      <div style="background:#fff;border-radius:10px;padding:24px;max-width:520px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.25);">
        <h3 style="margin:0 0 16px;font-size:18px;">${existing ? "Edit Rule" : "Add Rule"}</h3>
        <form id="rule-form" style="display:flex;flex-direction:column;gap:12px;">
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">Name
            <input name="name" value="${escapeHtml(r.name)}" required style="padding:8px;border:1px solid #d1d5db;border-radius:6px;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">Category
            <select name="category" style="padding:8px;border:1px solid #d1d5db;border-radius:6px;">
              <option value="typo" ${r.category === "typo" ? "selected" : ""}>Typo</option>
              <option value="spacing" ${r.category === "spacing" ? "selected" : ""}>Spacing</option>
              <option value="punctuation" ${r.category === "punctuation" ? "selected" : ""}>Punctuation</option>
              <option value="grammar" ${r.category === "grammar" ? "selected" : ""}>Grammar</option>
              <option value="capitalization" ${r.category === "capitalization" ? "selected" : ""}>Capitalization</option>
              <option value="numbers_abbreviations" ${r.category === "numbers_abbreviations" ? "selected" : ""}>Numbers &amp; abbreviations</option>
              <option value="hyphenation_terminology" ${r.category === "hyphenation_terminology" ? "selected" : ""}>Hyphenation &amp; terminology</option>
              <option value="custom" ${r.category === "custom" ? "selected" : ""}>Custom</option>
            </select>
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">Pattern (JavaScript regex, without / /)
            <input name="pattern" value="${escapeHtml(r.pattern)}" required style="padding:8px;border:1px solid #d1d5db;border-radius:6px;font-family:ui-monospace,monospace;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">Flags
            <input name="flags" value="${escapeHtml(r.flags || "g")}" placeholder="g, gi, gm…" style="padding:8px;border:1px solid #d1d5db;border-radius:6px;font-family:ui-monospace,monospace;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">Replacement (use $1, $2 for capture groups)
            <input name="replacement" value="${escapeHtml(r.replacement || "")}" style="padding:8px;border:1px solid #d1d5db;border-radius:6px;font-family:ui-monospace,monospace;" />
          </label>
          <label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">Severity
            <select name="severity" style="padding:8px;border:1px solid #d1d5db;border-radius:6px;">
              <option value="minor" ${r.severity === "minor" ? "selected" : ""}>Minor (yellow)</option>
              <option value="major" ${r.severity === "major" ? "selected" : ""}>Major (orange)</option>
              <option value="critical" ${r.severity === "critical" ? "selected" : ""}>Critical (red)</option>
            </select>
          </label>
          <div id="rule-preview" style="font-size:12px;color:#6b7280;padding:8px;background:#f9fafb;border-radius:6px;min-height:20px;"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
            <button type="button" id="rule-cancel" style="padding:8px 16px;border:1px solid #d1d5db;background:#fff;border-radius:6px;cursor:pointer;">Cancel</button>
            <button type="submit" style="padding:8px 16px;border:none;background:#3b82f6;color:#fff;border-radius:6px;cursor:pointer;">Save</button>
          </div>
        </form>
      </div>`;

    const form = modal.querySelector("#rule-form");
    const preview = modal.querySelector("#rule-preview");
    function updatePreview() {
      const fd = new FormData(form);
      try {
        const re = new RegExp(fd.get("pattern"), fd.get("flags") || "g");
        preview.textContent = `Pattern OK · ${re}`;
        preview.style.color = "#059669";
      } catch (err) {
        preview.textContent = `Invalid regex: ${err.message}`;
        preview.style.color = "#dc2626";
      }
    }
    form.addEventListener("input", updatePreview);
    updatePreview();

    modal.querySelector("#rule-cancel").addEventListener("click", () => modal.style.display = "none");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const rule = {
        id: r.id,
        name: fd.get("name").trim(),
        category: fd.get("category"),
        pattern: fd.get("pattern"),
        flags: (fd.get("flags") || "g").trim() || "g",
        replacement: fd.get("replacement") || "",
        severity: fd.get("severity"),
        enabled: r.enabled !== false,
      };
      try { new RegExp(rule.pattern, rule.flags); } catch (err) { alert("Invalid regex: " + err.message); return; }
      upsertRule(rule);
      modal.style.display = "none";
      renderRuleEditor();
    });
  }

  //
  // ─── Engines tab ──────────────────────────────────────────────────────
  //
  window.loadEngineStatus = function () {
    const overall = document.getElementById("engine-overall-card");
    const grid = document.getElementById("engine-check-grid");
    if (overall) {
      overall.innerHTML = `
        <div style="padding:16px 20px;text-align:center;color:#6b7280;font-size:13px;line-height:1.6;">
          <strong>Backend required.</strong> Engine readiness (PyMuPDF, Ollama, Vale) is probed by the FastAPI backend.
          Preview mode uses only the rule editor in <strong>Team Manual Standard</strong>.
        </div>`;
    }
    if (grid) grid.innerHTML = "";
  };

  //
  // ─── utils ─────────────────────────────────────────────────────────────
  //
  function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
  function on(id, ev, handler) { const el = document.getElementById(id); if (el) el.addEventListener(ev, handler); }
  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return "—";
    const units = ["B", "KB", "MB", "GB"]; let i = 0, n = bytes;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
  }
  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
})();
