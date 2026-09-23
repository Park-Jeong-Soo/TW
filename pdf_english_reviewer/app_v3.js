const FEATURES = {
  manualGlossaryUi: false,
  manualGlossaryMatcher: false,
  rulePromotionActionsUi: false,
  teamStandardDb: true,
  teamStandardCandidateImportUi: true,
  languageToolUi: false,
};

const state = {
  documentId: null,
  document: null,
  issues: [],
  currentPage: 1,
  activeIssueId: null,
  zoom: 1,
  viewMode: "one",
  currentView: "reviewer",
  projects: [],
  workspaces: [],
  glossaryItems: [],
  teamStandardRules: [],
  selectedTeamCandidateIssueIds: new Set(),
  pendingGlossaryMetadata: { engine_suggestions: [], provenance: {} },
  navigationHistory: [],
  historyIndex: -1,
  pageObserver: null,
  saveTimer: null,
  scrollTimer: null,
  engineStatus: null,
  textSelectionMode: false,
  engineProbeRunning: false,
  enginePollTimer: null,
  reviewRunning: false,
  reviewRequestActive: false,
  reviewProgressTimer: null,
  reviewProgressPollBusy: false,
  reviewLogTick: 0,
  ollamaLogLoading: false,
  standards: [],
  profiles: [],
  activeProfileId: "technical_manual",
  enabledStandards: [],
  enabledEngines: ["vale", "team_rule", "glossary"],
  reviewCapabilities: {
    full: false,
    basic: false,
    grammar: false,
    context: false,
  },
  reviewEngineConfig: null,
  engineInfo: null,
  ruleDashboard: {
    tab: "inventory",
    inventoryPage: 1,
    findingsPage: 1,
    limit: 50,
  },
  reviewMemory: {
    summary: null,
    backups: [],
    folderPath: "",
  },
};

const $ = (id) => document.getElementById(id);

function showToast(message) {
  const toast = $("toast");
  toast.textContent = String(message);
  toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.add("hidden"), 3600);
}

function formatReviewDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  if (minutes < 60) return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const minuteRemainder = minutes % 60;
  return minuteRemainder ? `${hours}h ${minuteRemainder}m` : `${hours}h`;
}

function setReviewControlsRunning(running) {
  state.reviewRunning = running;
  $("run-full-review-btn").disabled = running || !state.reviewCapabilities.full;
  $("run-part-review-btn").disabled = running || !state.reviewCapabilities.basic;
}

function renderReviewProgress(progress) {
  if (!progress) return;
  const panel = $("review-progress-panel");
  const visible = ["running", "completed", "failed", "interrupted"].includes(progress.status);
  panel.classList.toggle("hidden", !visible);
  if (!visible) return;

  const percent = Math.max(0, Math.min(100, Number(progress.percent) || 0));
  $("review-progress-stage").textContent = progress.stage_label || "Reviewing document";
  $("review-progress-percent").textContent = `${percent}%`;
  $("review-progress-fill").style.width = `${percent}%`;
  $("review-progress-track").setAttribute("aria-valuenow", String(percent));
  $("review-progress-location").textContent = progress.detail || "Waiting for the next review step.";
  $("review-progress-engine").textContent = progress.active_engine
    ? `Current engine: ${progress.active_engine}`
    : "";
  $("review-progress-findings").textContent = `${Number(progress.issues_found) || 0} suggestions found`;

  if (progress.status === "running") {
    const elapsed = `Elapsed ${formatReviewDuration(progress.elapsed_seconds)}`;
    const remaining = progress.eta_seconds == null
      ? "Estimating time remaining…"
      : `About ${formatReviewDuration(progress.eta_seconds)} remaining`;
    $("review-progress-time").textContent = `${elapsed} · ${remaining}`;
    $("review-status").textContent = `${progress.stage_label || "Reviewing"} — ${percent}%`;
  } else if (progress.status === "completed") {
    $("review-progress-time").textContent = `Completed in ${formatReviewDuration(progress.elapsed_seconds)}`;
  } else {
    $("review-progress-time").textContent = `Stopped after ${formatReviewDuration(progress.elapsed_seconds)}`;
  }
}

async function loadReviewProgress() {
  if (!state.documentId || state.reviewProgressPollBusy) return null;
  state.reviewProgressPollBusy = true;
  try {
    const progress = await api(`/api/documents/${state.documentId}/review/progress`);
    const wasRunning = state.reviewRunning;
    renderReviewProgress(progress);
    if (progress.status === "running") {
      setReviewControlsRunning(true);
      state.reviewLogTick += 1;
      if (state.reviewLogTick % 5 === 0) loadOllamaReviewLog();
    } else if (wasRunning && !state.reviewRequestActive) {
      stopReviewProgressPolling();
      setReviewControlsRunning(false);
      await loadIssues();
      if (progress.status === "completed") {
        $("review-status").textContent = `Completed: ${progress.issues_found} suggestions`;
      } else {
        $("review-status").textContent = progress.stage_label || "Review stopped";
      }
    }
    return progress;
  } catch (_error) {
    return null;
  } finally {
    state.reviewProgressPollBusy = false;
  }
}

function startReviewProgressPolling() {
  stopReviewProgressPolling();
  loadReviewProgress();
  state.reviewProgressTimer = window.setInterval(loadReviewProgress, 1000);
}

function stopReviewProgressPolling() {
  if (state.reviewProgressTimer) window.clearInterval(state.reviewProgressTimer);
  state.reviewProgressTimer = null;
}

function failureGuidance(error, operation) {
  const status = Number(error.status || 0);
  const message = error.message || "Unknown local error.";
  const guidance = {
    title: `${operation} failed`,
    reason: message,
    steps: [
      "Run Local Diagnostics below.",
      "Restart Reviewer and retry the operation.",
      "If it still fails, check data/logs/audit.log for the failed action and timestamp.",
    ],
  };
  if (!status) {
    guidance.reason = "The local Reviewer server did not respond.";
    guidance.steps = [
      "Confirm run_local.bat is still running.",
      "Open http://127.0.0.1:8000 and retry.",
      "If the server window closed, restart it and review the last console error.",
    ];
  } else if (status === 400) {
    guidance.steps = [
      "Check that the PDF is valid, unencrypted, and not password protected.",
      "For form errors, verify required values and page numbers.",
      "Create a clean PDF copy and upload it again if validation continues to fail.",
    ];
  } else if (status === 403) {
    guidance.steps = [
      "Open Reviewer only through http://127.0.0.1:8000 or localhost.",
      "Do not access it from another PC or network address.",
    ];
  } else if (status === 408) {
    guidance.steps = [
      "Confirm Ollama Local is responsive when context review is selected.",
      "Check the approved model status on the Engine Status page.",
      "Use a smaller PDF or review fewer pages.",
    ];
  } else if (status === 409) {
    guidance.steps = [
      "Open the existing document from Workspaces instead of uploading it again.",
      "Delete the old workspace first only if a fresh review is required.",
    ];
  } else if (status === 410) {
    guidance.steps = [
      "The original PDF is no longer stored.",
      "Delete the unavailable workspace and upload the PDF again.",
    ];
  } else if (status === 413) {
    guidance.steps = [
      "Reduce the PDF file size, page count, or page dimensions.",
      "Split the manual into smaller PDF files and review them separately.",
    ];
  } else if (status === 422) {
    guidance.reason = message;
    guidance.steps = [
      "Grammar, Typos, and Context are fixed Full Review checks.",
      "Refresh the page and run Full Review again.",
    ];
  } else if (status === 503) {
    guidance.steps = [
      "Start secure Ollama Local when context review is selected.",
      "Confirm the approved local model is installed.",
      "For OCR, install local Tesseract and the requested language data.",
    ];
  }
  if (message.toLocaleLowerCase().includes("endpoint") && message.toLocaleLowerCase().includes("blocked")) {
    guidance.steps = [
      "Use a localhost Ollama endpoint.",
      "For an approved internal host, add it to APPROVED_ENGINE_HOSTS and restart Reviewer.",
      "External SaaS endpoints remain blocked by design.",
    ];
  }
  return guidance;
}

function showFailure(error, operation) {
  const guidance = failureGuidance(error, operation);
  $("failure-title").textContent = guidance.title;
  $("failure-reason").textContent = guidance.reason;
  $("failure-steps").innerHTML = guidance.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
  $("diagnostics-results").classList.add("hidden");
  $("failure-panel").classList.remove("hidden");
  showToast(guidance.reason);
}

function hideFailure() {
  $("failure-panel").classList.add("hidden");
}

function showNoIssuesFound(result, selectedChecks) {
  const checks = selectedChecks.filter((item) => item.enabled).map((item) => item.label);
  $("no-issues-summary").innerHTML = `
    <span><strong>Result:</strong> 0 suggestions</span>
    <span><strong>Pages reviewed:</strong> ${result.reviewed_pages}</span>
    <span><strong>Checks:</strong> ${escapeHtml(checks.join(", "))}</span>
    ${result.warnings?.length ? `<span><strong>Engine notice:</strong> ${escapeHtml(result.warnings.join(" "))}</span>` : ""}
  `;
  hideFailure();
  $("no-issues-modal").classList.remove("hidden");
}

function hideNoIssuesFound() {
  $("no-issues-modal").classList.add("hidden");
}

async function runDiagnostics() {
  const button = $("run-diagnostics-btn");
  button.disabled = true;
  button.textContent = "Checking local components…";
  try {
    const params = new URLSearchParams({ probe_engines: "true" });
    if (state.documentId) params.set("document_id", state.documentId);
    const result = await api(`/api/diagnostics?${params}`);
    const target = $("diagnostics-results");
    target.classList.remove("hidden");
    target.innerHTML = `
      <div class="diagnostic-summary">Overall: ${escapeHtml(result.overall.toUpperCase())}</div>
      ${result.checks.map((check) => `
        <div class="diagnostic-row ${escapeHtml(check.status)}">
          <strong>${escapeHtml(check.name)} — ${escapeHtml(check.status.toUpperCase())}</strong>
          <span>${escapeHtml(check.detail)}</span>
          ${check.fix ? `<span class="diagnostic-fix">Fix: ${escapeHtml(check.fix)}</span>` : ""}
        </div>
      `).join("")}
    `;
  } catch (error) {
    $("diagnostics-results").classList.remove("hidden");
    $("diagnostics-results").textContent = `Diagnostics could not run: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "Run Local Diagnostics";
  }
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    let detail = message;
    try {
      const data = await response.json();
      detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      message = detail;
    } catch (_) {}
    const error = new Error(message);
    error.status = response.status;
    error.detail = detail;
    throw error;
  }
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function updateDownloadLinks() {
  const visible = Boolean(state.documentId) && state.currentView === "reviewer";
  $("download-csv-btn").classList.toggle("hidden", !visible);
  $("download-json-btn").classList.toggle("hidden", !visible);
  $("download-pdf-btn").classList.toggle("hidden", !visible);
}

function renderDocumentInfo() {
  if (!state.document) return;
  $("document-name").textContent = state.document.filename;
  $("document-meta").textContent = `${state.document.project_name} · ${state.document.page_count} pages · ${state.document.reviewer}`;
  $("page-number-input").max = state.document.page_count;
  updatePageIndicator();
}

function updatePageIndicator() {
  const count = state.document?.page_count || "—";
  $("page-number-input").value = state.currentPage;
  $("page-label").textContent = `/ ${count}`;
  $("previous-page-btn").disabled = !state.document || state.currentPage <= 1;
  $("next-page-btn").disabled = !state.document || state.currentPage >= state.document.page_count;
  document.querySelectorAll(".pdf-page-shell").forEach((element) => {
    element.classList.toggle("current-page", Number(element.dataset.page) === state.currentPage);
  });
}

function pageBaseWidth() {
  return state.viewMode === "two" ? 430 : 760;
}

function captureLocation() {
  const container = $("pdf-canvas-wrap");
  const pageElement = document.querySelector(`.pdf-page-shell[data-page="${state.currentPage}"]`);
  let scrollOffset = 0;
  if (pageElement) {
    scrollOffset = clamp(
      (container.scrollTop - pageElement.offsetTop) / Math.max(1, pageElement.offsetHeight),
      0,
      1
    );
  }
  return {
    document_id: state.documentId,
    page_number: state.currentPage,
    issue_id: state.activeIssueId,
    scroll_offset: scrollOffset,
    zoom_level: state.zoom,
    view_mode: state.viewMode,
    label: `p.${state.currentPage}`,
    last_opened_at: new Date().toISOString(),
  };
}

function renderDocumentPages(preserveLocation = true) {
  const target = $("pdf-document");
  if (!state.document?.pages?.length) {
    target.innerHTML = `<div class="empty-viewer">No PDF pages are available.</div>`;
    return;
  }
  const previous = preserveLocation ? captureLocation() : null;
  const baseWidth = pageBaseWidth() * state.zoom;
  target.className = `pdf-document ${state.viewMode === "two" ? "two-page" : "one-page"} ${state.textSelectionMode ? "text-selection-mode" : ""}`;
  target.innerHTML = state.document.pages.map((page) => {
    const pageWidth = Math.round(baseWidth);
    const pageHeight = Math.round(pageWidth * (Number(page.height) / Number(page.width)));
    return `
      <article class="pdf-page-shell" data-page="${page.page}" style="width:${pageWidth}px;height:${pageHeight}px">
        <div class="page-placeholder">Page ${page.page}</div>
        <img alt="PDF page ${page.page}" />
        <div class="page-text-layer"></div>
        <div class="page-highlight-layer"></div>
        <span class="page-number-badge">${page.page}</span>
      </article>
    `;
  }).join("");
  setupPageObserver();
  renderAllHighlights();
  updatePageIndicator();
  $("zoom-label").textContent = `${Math.round(state.zoom * 100)}%`;
  $("one-page-mode-btn").classList.toggle("active", state.viewMode === "one");
  $("two-page-mode-btn").classList.toggle("active", state.viewMode === "two");
  if (previous) {
    window.requestAnimationFrame(() => restoreLocation(previous, false));
  } else {
    loadPagesNear(state.currentPage);
  }
}

function setupPageObserver() {
  if (state.pageObserver) state.pageObserver.disconnect();
  state.pageObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const page = Number(entry.target.dataset.page);
      if (entry.isIntersecting) {
        loadPageImage(page);
      } else if (Math.abs(page - state.currentPage) > 5) {
        releasePageImage(page);
      }
    });
  }, {
    root: $("pdf-canvas-wrap"),
    rootMargin: "1200px 0px",
    threshold: 0.01,
  });
  document.querySelectorAll(".pdf-page-shell").forEach((element) => state.pageObserver.observe(element));
}

function renderScale() {
  return state.zoom >= 1.7 ? 2.25 : 1.5;
}

function loadPageImage(pageNumber) {
  if (!state.documentId) return;
  const pageElement = document.querySelector(`.pdf-page-shell[data-page="${pageNumber}"]`);
  const image = pageElement?.querySelector("img");
  if (!image || image.dataset.loading === "true" || image.getAttribute("src")) return;
  loadPageTextLayer(pageNumber);
  image.dataset.loading = "true";
  image.addEventListener("load", () => {
    pageElement.classList.add("loaded");
    image.dataset.loading = "false";
  }, { once: true });
  image.addEventListener("error", () => {
    image.dataset.loading = "false";
    pageElement.querySelector(".page-placeholder").textContent = `Page ${pageNumber} could not be rendered`;
  }, { once: true });
  image.src = `/api/documents/${state.documentId}/page/${pageNumber}.png?scale=${renderScale()}`;
}

async function loadPageTextLayer(pageNumber) {
  if (!state.documentId) return;
  const pageElement = document.querySelector(`.pdf-page-shell[data-page="${pageNumber}"]`);
  const layer = pageElement?.querySelector(".page-text-layer");
  if (!layer || layer.dataset.loading === "true" || layer.dataset.loaded === "true") return;
  layer.dataset.loading = "true";
  try {
    const result = await api(`/api/documents/${state.documentId}/page/${pageNumber}/text-layer`);
    if (!pageElement.isConnected) return;
    const displayWidth = pageElement.clientWidth;
    const displayHeight = pageElement.clientHeight;
    layer.innerHTML = result.words.map((word) => {
      const left = word.x0 / result.width * 100;
      const top = word.y0 / result.height * 100;
      const width = Math.max(0.2, (word.x1 - word.x0) / result.width * 100);
      const height = Math.max(0.2, (word.y1 - word.y0) / result.height * 100);
      const fontSize = Math.max(5, (word.y1 - word.y0) / result.height * displayHeight * 0.86);
      return `<span class="text-layer-word" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;font-size:${fontSize}px;line-height:1">${escapeHtml(word.text)} </span>`;
    }).join("");
    layer.dataset.loaded = "true";
  } catch (error) {
    layer.dataset.error = "true";
  } finally {
    layer.dataset.loading = "false";
  }
}

function releasePageImage(pageNumber) {
  const pageElement = document.querySelector(`.pdf-page-shell[data-page="${pageNumber}"]`);
  const image = pageElement?.querySelector("img");
  if (image?.getAttribute("src")) {
    image.removeAttribute("src");
    image.dataset.loading = "false";
    pageElement.classList.remove("loaded");
  }
  const textLayer = pageElement?.querySelector(".page-text-layer");
  if (textLayer) {
    textLayer.replaceChildren();
    textLayer.dataset.loaded = "false";
    textLayer.dataset.loading = "false";
  }
}

function loadPagesNear(pageNumber) {
  for (let page = Math.max(1, pageNumber - 2); page <= Math.min(state.document?.page_count || 0, pageNumber + 2); page += 1) {
    loadPageImage(page);
    loadPageTextLayer(page);
  }
}

function toggleTextSelectionMode() {
  state.textSelectionMode = !state.textSelectionMode;
  $("pdf-document").classList.toggle("text-selection-mode", state.textSelectionMode);
  const button = $("text-selection-btn");
  button.classList.toggle("active", state.textSelectionMode);
  button.setAttribute("aria-pressed", String(state.textSelectionMode));
  button.textContent = state.textSelectionMode ? "Selecting Text" : "Select Text";
  if (state.textSelectionMode) loadPagesNear(state.currentPage);
  showToast(state.textSelectionMode
    ? "Text selection is on. Drag across PDF text and copy it."
    : "Text selection is off. Review highlights are clickable again.");
}

function updateCurrentPageFromScroll() {
  const container = $("pdf-canvas-wrap");
  const viewportCenter = container.scrollTop + container.clientHeight / 2;
  let bestPage = state.currentPage;
  let bestDistance = Number.POSITIVE_INFINITY;
  document.querySelectorAll(".pdf-page-shell").forEach((element) => {
    const center = element.offsetTop + element.offsetHeight / 2;
    const distance = Math.abs(center - viewportCenter);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPage = Number(element.dataset.page);
    }
  });
  if (bestPage !== state.currentPage) {
    state.currentPage = bestPage;
    updatePageIndicator();
    loadPagesNear(bestPage);
  }
  scheduleSaveUiState();
}

function setZoom(nextZoom, preserve = true) {
  const location = preserve ? captureLocation() : null;
  state.zoom = clamp(Number(nextZoom.toFixed(2)), 0.5, 2.5);
  renderDocumentPages(false);
  if (location) {
    location.zoom_level = state.zoom;
    window.requestAnimationFrame(() => restoreLocation(location, false));
  }
  scheduleSaveUiState();
}

function setViewMode(mode, preserve = true) {
  if (mode === "two" && $("pdf-canvas-wrap").clientWidth < 980) {
    showToast("The viewer is too narrow for 2 Pages mode. Using 1 Page.");
    mode = "one";
  }
  const location = preserve ? captureLocation() : null;
  state.viewMode = mode;
  renderDocumentPages(false);
  if (location) {
    location.view_mode = mode;
    window.requestAnimationFrame(() => restoreLocation(location, false));
  }
  scheduleSaveUiState();
}

function fitWidth() {
  const columns = state.viewMode === "two" ? 2 : 1;
  const available = $("pdf-canvas-wrap").clientWidth - 72 - (columns - 1) * 24;
  setZoom(available / (pageBaseWidth() * columns));
}

function fitPage() {
  const page = state.document?.pages?.[state.currentPage - 1];
  if (!page) return;
  const availableWidth = $("pdf-canvas-wrap").clientWidth - 72;
  const availableHeight = $("pdf-canvas-wrap").clientHeight - 60;
  const baseWidth = pageBaseWidth();
  const baseHeight = baseWidth * (page.height / page.width);
  setZoom(Math.min(availableWidth / baseWidth, availableHeight / baseHeight));
}

function restoreLocation(location, focusIssueHighlight = true) {
  if (!state.document || location.document_id !== state.documentId) return;
  const needsLayout = location.view_mode !== state.viewMode || Math.abs(location.zoom_level - state.zoom) > 0.001;
  state.viewMode = location.view_mode || "one";
  state.zoom = clamp(Number(location.zoom_level || 1), 0.5, 2.5);
  state.currentPage = clamp(Number(location.page_number || 1), 1, state.document.page_count);
  state.activeIssueId = location.issue_id || null;
  if (needsLayout) renderDocumentPages(false);
  window.requestAnimationFrame(() => {
    const container = $("pdf-canvas-wrap");
    const pageElement = document.querySelector(`.pdf-page-shell[data-page="${state.currentPage}"]`);
    if (!pageElement) return;
    const issue = state.issues.find((item) => item.id === state.activeIssueId);
    const issueOffset = issue ? clamp(issue.bbox[1] / state.document.pages[state.currentPage - 1].height, 0, 1) : null;
    const relativeOffset = issueOffset ?? clamp(Number(location.scroll_offset || 0), 0, 1);
    container.scrollTop = pageElement.offsetTop + pageElement.offsetHeight * relativeOffset - container.clientHeight * (issue ? 0.42 : 0.12);
    loadPagesNear(state.currentPage);
    updatePageIndicator();
    renderAllHighlights();
    if (focusIssueHighlight && issue) {
      const highlight = document.querySelector(`.pdf-highlight[data-issue-id="${CSS.escape(issue.id)}"]`);
      highlight?.classList.add("pulse");
      window.setTimeout(() => highlight?.classList.remove("pulse"), 1400);
    }
    scheduleSaveUiState();
  });
}

function locationsEqual(left, right) {
  return left && right
    && left.page_number === right.page_number
    && left.issue_id === right.issue_id
    && left.view_mode === right.view_mode
    && Math.abs(left.zoom_level - right.zoom_level) < 0.01;
}

function navigateToLocation(location, addToHistory = true) {
  const target = {
    ...location,
    document_id: state.documentId,
    zoom_level: Number(location.zoom_level || state.zoom),
    view_mode: location.view_mode || state.viewMode,
    last_opened_at: new Date().toISOString(),
  };
  if (addToHistory) {
    const current = captureLocation();
    if (state.navigationHistory.length === 0) {
      state.navigationHistory.push(current);
      state.historyIndex = 0;
    }
    const last = state.navigationHistory[state.historyIndex];
    if (!locationsEqual(last, current)) {
      state.navigationHistory = state.navigationHistory.slice(0, state.historyIndex + 1);
      state.navigationHistory.push(current);
      state.historyIndex = state.navigationHistory.length - 1;
    }
    if (!locationsEqual(state.navigationHistory[state.historyIndex], target)) {
      state.navigationHistory = state.navigationHistory.slice(0, state.historyIndex + 1);
      state.navigationHistory.push(target);
      state.historyIndex = state.navigationHistory.length - 1;
    }
    state.navigationHistory = state.navigationHistory.slice(-40);
    state.historyIndex = state.navigationHistory.length - 1;
  }
  updateHistoryButtons();
  restoreLocation(target);
}

function updateHistoryButtons() {
  $("history-back-btn").disabled = state.historyIndex <= 0;
  $("history-forward-btn").disabled = state.historyIndex < 0 || state.historyIndex >= state.navigationHistory.length - 1;
}

function moveHistory(direction) {
  const next = state.historyIndex + direction;
  if (next < 0 || next >= state.navigationHistory.length) return;
  state.historyIndex = next;
  updateHistoryButtons();
  restoreLocation(state.navigationHistory[next]);
}

function shortIssueLabel(issue) {
  const source = String(issue?.source_text || "").replace(/\s+/g, " ").slice(0, 28);
  const category = issue ? issue.category.charAt(0).toUpperCase() + issue.category.slice(1) : "Pinned Page";
  return source ? `${category}: ${source}` : category;
}

function uiStorageKey() {
  return `pdf-reviewer-ui:${state.documentId}`;
}

function scheduleSaveUiState() {
  if (!state.documentId) return;
  $("save-progress-status").textContent = "Local changes";
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(saveUiState, 180);
}

function buildUiStatePayload() {
  const validIssueIds = new Set(state.issues.map((issue) => issue.id));
  const sanitizeLocation = (location) => {
    const issueId = validIssueIds.has(location.issue_id) ? location.issue_id : null;
    return {
      key: issueId ? `issue:${issueId}` : `page:${location.page_number}`,
      document_id: state.documentId,
      page_number: location.page_number,
      issue_id: issueId,
      scroll_offset: clamp(Number(location.scroll_offset || 0), 0, 1),
      zoom_level: clamp(Number(location.zoom_level || 1), 0.5, 2.5),
      view_mode: location.view_mode === "two" ? "two" : "one",
      label: String(location.label || `p.${location.page_number}`).slice(0, 60),
      last_opened_at: location.last_opened_at || new Date().toISOString(),
    };
  };
  const history = state.navigationHistory.slice(-40).map(sanitizeLocation);
  return {
    last_location: sanitizeLocation(captureLocation()),
    tabs: [],
    active_tab_key: null,
    history,
    history_index: clamp(state.historyIndex, -1, Math.max(-1, history.length - 1)),
  };
}

function saveUiState() {
  if (!state.documentId) return;
  const payload = {
    ...buildUiStatePayload(),
    saved_at: new Date().toISOString(),
  };
  localStorage.setItem(uiStorageKey(), JSON.stringify(payload));
}

async function saveProgress() {
  if (!state.documentId) return;
  const button = $("save-progress-btn");
  button.disabled = true;
  button.textContent = "Saving…";
  saveUiState();
  try {
    const result = await api(`/api/documents/${state.documentId}/ui-state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildUiStatePayload()),
    });
    $("save-progress-status").textContent = `Saved ${new Date(result.saved_at).toLocaleTimeString()}`;
    hideFailure();
    showToast("Review progress saved to the local database.");
  } catch (error) {
    showFailure(error, "Save progress");
  } finally {
    button.disabled = false;
    button.textContent = "Save Progress";
  }
}

function loadUiState(serverState = null, serverUpdatedAt = null) {
  state.navigationHistory = [];
  state.historyIndex = -1;
  try {
    const local = JSON.parse(localStorage.getItem(uiStorageKey()) || "{}");
    const localTime = Date.parse(local.saved_at || "") || 0;
    const serverTime = Date.parse(serverUpdatedAt || "") || 0;
    const saved = serverState && serverTime >= localTime ? serverState : local;
    const validIssueIds = new Set(state.issues.map((issue) => issue.id));
    const normalizeSavedLocation = (location) => {
      if (location.issue_id && !validIssueIds.has(location.issue_id)) {
        location.issue_id = null;
        location.key = `page:${location.page_number}`;
      }
      location.document_id = state.documentId;
      return location;
    };
    state.navigationHistory = Array.isArray(saved.history)
      ? saved.history.filter((item) => item.document_id === state.documentId).map(normalizeSavedLocation)
      : [];
    state.historyIndex = clamp(Number(saved.history_index ?? state.navigationHistory.length - 1), -1, state.navigationHistory.length - 1);
    if (saved.last_location?.document_id === state.documentId) {
      normalizeSavedLocation(saved.last_location);
      state.currentPage = clamp(Number(saved.last_location.page_number || 1), 1, state.document.page_count);
      state.zoom = clamp(Number(saved.last_location.zoom_level || 1), 0.5, 2.5);
      state.viewMode = saved.last_location.view_mode === "two" ? "two" : "one";
      state.activeIssueId = saved.last_location.issue_id || null;
      $("save-progress-status").textContent = serverState && serverTime >= localTime ? "Saved workspace restored" : "Local workspace restored";
      return saved.last_location;
    }
  } catch (_) {
    localStorage.removeItem(uiStorageKey());
  }
  return null;
}

function renderAllHighlights() {
  document.querySelectorAll(".page-highlight-layer").forEach((layer) => {
    const page = Number(layer.closest(".pdf-page-shell").dataset.page);
    const pageInfo = state.document?.pages?.[page - 1];
    if (!pageInfo) return;
    layer.innerHTML = reviewVisibleIssueSource()
      .filter((issue) => Number(issue.page) === page && !["ignored", "rejected"].includes(issue.status))
      .map((issue) => {
        const [x0, y0, x1, y1] = issue.bbox;
        const active = issue.id === state.activeIssueId ? "active" : "";
        return `<button class="pdf-highlight ${active}" data-issue-id="${issue.id}" data-category="${escapeHtml(issue.category)}" style="left:${x0 / pageInfo.width * 100}%;top:${y0 / pageInfo.height * 100}%;width:${Math.max(1.2, (x1 - x0) / pageInfo.width * 100)}%;height:${Math.max(1, (y1 - y0) / pageInfo.height * 100)}%;" title="${escapeHtml(issue.category)}"></button>`;
      }).join("");
    layer.querySelectorAll("[data-issue-id]").forEach((button) => {
      button.addEventListener("click", () => focusIssue(button.dataset.issueId));
    });
  });
}


function issueCounts() {
  return reviewVisibleIssueSource()
    .filter((issue) => issue.status !== "rejected")
    .reduce((counts, issue) => {
    counts[issue.category] = (counts[issue.category] || 0) + 1;
    return counts;
  }, {});
}

function engineCounts() {
  return reviewVisibleIssueSource()
    .filter((issue) => issue.status !== "rejected")
    .reduce((counts, issue) => {
      const engine = issue.engine || "basic";
      counts[engine] = (counts[engine] || 0) + 1;
      return counts;
    }, {});
}

function categoryLabel(category) {
  return ({
    numbers_abbreviations: "numbers and abbreviations",
    hyphenation_terminology: "hyphenation and terminology",
  })[category] || category;
}

function engineLabel(engine) {
  return ({
    basic: "Basic",
    publishing_standard: "Publishing Standard",
    team_rule: "Team Rule",
    glossary: "Glossary",
    vale: "Vale",
    ollama: "Ollama",
  })[engine] || engine;
}

function isLanguageToolIssue(issue) {
  return [
    issue.engine,
    issue.source_id,
    issue.source_label,
    issue.rule_source,
    issue.standard,
  ].some((value) => String(value || "").toLowerCase().includes("languagetool"));
}

function reviewVisibleIssueSource() {
  return FEATURES.languageToolUi
    ? state.issues
    : state.issues.filter((issue) => !isLanguageToolIssue(issue));
}

function standardCounts() {
  return reviewVisibleIssueSource()
    .filter((issue) => issue.status !== "rejected")
    .reduce((counts, issue) => {
      const standard = issue.standard || issue.rule_source || "Internal";
      counts[standard] = (counts[standard] || 0) + 1;
      return counts;
    }, {});
}

function standardLabel(standard) {
  const found = state.standards.find((item) => item.id === standard);
  return found?.name || standard || "Internal reviewer rule";
}

function selectedStandardIds() {
  return [...document.querySelectorAll("[data-standard-setting]:checked")].map((input) => input.dataset.standardSetting);
}

function selectedEngineIds() {
  return [...document.querySelectorAll("[data-engine-setting]:checked")].map((input) => input.dataset.engineSetting);
}

function selectedInternalStandardIds() {
  return [...document.querySelectorAll("[data-internal-standard-setting]:checked")].map((input) => input.dataset.internalStandardSetting);
}

function selectedEngineFlags() {
  const engines = selectedEngineIds();
  return {
    vale: engines.includes("vale"),
    ollama: engines.includes("ollama"),
  };
}

function selectedInternalStandardFlags() {
  const internal = selectedInternalStandardIds();
  return { team_manual: internal.includes("team_manual") };
}

function selectedExternalStandardFlags() {
  const standards = selectedStandardIds().map((item) => item.toLowerCase());
  return {
    microsoft: standards.includes("microsoft"),
    ieee: standards.includes("ieee"),
    ams: standards.includes("ams"),
    nist: standards.includes("nist"),
  };
}

function applyProfileToSettings(profileId) {
  const profile = state.profiles.find((item) => item.id === profileId) || state.profiles[0];
  if (!profile) return;
  state.activeProfileId = profile.id;
  state.enabledStandards = [...profile.enabled_standards];
  state.enabledEngines = [...profile.enabled_engines];
  $("review-profile-select").value = profile.id;
  document.querySelectorAll("[data-standard-setting]").forEach((input) => {
    input.checked = state.enabledStandards.includes(input.dataset.standardSetting);
  });
  document.querySelectorAll("[data-engine-setting]").forEach((input) => {
    input.checked = state.enabledEngines.includes(input.dataset.engineSetting);
  });
  document.querySelectorAll("[data-internal-standard-setting]").forEach((input) => {
    input.checked = state.enabledEngines.includes("team_rule") && input.dataset.internalStandardSetting === "team_manual";
  });
}

function markProfileCustom() {
  if (state.activeProfileId === "custom") return;
  state.activeProfileId = "custom";
  $("review-profile-select").value = "custom";
}

function renderReviewSettings() {
  $("review-profile-select").innerHTML = state.profiles.map((profile) => (
    `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)}</option>`
  )).join("");
  $("publishing-standards-list").innerHTML = state.standards.map((standard) => `
    <label><input type="checkbox" data-standard-setting="${escapeHtml(standard.id)}" /> ${escapeHtml(standard.name)}</label>
  `).join("");
  $("standard-filter").innerHTML = `<option value="all">All standards</option>` + state.standards.map((standard) => (
    `<option value="${escapeHtml(standard.id)}">${escapeHtml(standard.id)}</option>`
  )).join("");
  applyProfileToSettings(state.activeProfileId);
  document.querySelectorAll("[data-standard-setting], [data-engine-setting], [data-internal-standard-setting]").forEach((input) => {
    input.addEventListener("change", () => {
      markProfileCustom();
      state.enabledStandards = selectedStandardIds();
      state.enabledEngines = selectedEngineIds();
      if (selectedInternalStandardIds().includes("team_manual")) state.enabledEngines.push("team_rule");
    });
  });
}

async function loadReviewSettings() {
  const [standardsPayload, profilesPayload] = await Promise.all([
    api("/api/standards"),
    api("/api/review-profiles"),
  ]);
  state.standards = standardsPayload.standards || [];
  state.profiles = profilesPayload.profiles || [];
  state.activeProfileId = profilesPayload.default_profile || state.profiles[0]?.id || "technical_manual";
  renderReviewSettings();
}

function severityRank(severity) {
  return ({ critical: 3, major: 2, minor: 1 })[String(severity || "").toLowerCase()] || 0;
}

function issueY(issue) {
  return Array.isArray(issue.bbox) ? Number(issue.bbox[1]) || 0 : 0;
}

function renderSummary() {
  const counts = issueCounts();
  const order = ["content", "grammar", "awkward", "typo", "consistency", "format", "punctuation", "capitalization", "numbers_abbreviations", "hyphenation_terminology"];
  const engineOrder = ["publishing_standard", "team_rule", "glossary", "vale", "basic", "ollama"];
  const engines = engineCounts();
  const standards = standardCounts();
  const categoryPills = order.filter((category) => counts[category]).map((category) => (
    `<span class="pill ${category}">${escapeHtml(categoryLabel(category))} ${counts[category]}</span>`
  ));
  const standardPills = Object.keys(standards).sort().map((standard) => (
    `<span class="pill engine-pill">${escapeHtml(standard)} ${standards[standard]}</span>`
  ));
  const enginePills = engineOrder.filter((engine) => engines[engine]).map((engine) => (
    `<span class="pill engine-pill">${escapeHtml(engineLabel(engine))} ${engines[engine]}</span>`
  ));
  $("summary-pills").innerHTML = [...categoryPills, ...standardPills, ...enginePills].join("");
  $("issue-total").textContent = reviewVisibleIssueSource().filter((issue) => issue.status !== "rejected").length;
}

function visibleIssues() {
  const category = $("category-filter").value;
  const engine = $("engine-filter") ? $("engine-filter").value : "all";
  const standard = $("standard-filter") ? $("standard-filter").value : "all";
  const filtered = reviewVisibleIssueSource().filter((issue) =>
    issue.status !== "rejected"
    && (category === "all" || issue.category === category)
    && (engine === "all" || (issue.engine || "basic") === engine)
    && (standard === "all" || (issue.standard || issue.rule_source || "") === standard)
  );
  return filtered.sort((left, right) => (
    Number(left.page) - Number(right.page)
    || issueY(left) - issueY(right)
    || severityRank(right.severity) - severityRank(left.severity)
  ));
}

function canImportIssueAsTeamCandidate(issue) {
  return FEATURES.teamStandardCandidateImportUi
    && !isLanguageToolIssue(issue)
    && issue.source_type === "external_engine"
    && !issue.team_manual_candidate_rule_id;
}

function renderCandidateSelector(issue) {
  if (issue.team_manual_candidate_rule_id) {
    return `<span class="candidate-added">Added as Candidate</span>`;
  }
  if (!canImportIssueAsTeamCandidate(issue)) return "";
  const checked = state.selectedTeamCandidateIssueIds.has(issue.id) ? "checked" : "";
  return `<label class="candidate-select"><input type="checkbox" data-team-candidate-issue="${escapeHtml(issue.id)}" ${checked} /> Candidate</label>`;
}

function renderIssueList() {
  const issues = visibleIssues();
  const target = $("issues-list");
  if (!issues.length) {
    target.innerHTML = `<div class="empty-issues">No suggestions match this filter.</div>`;
    updateBulkCategoryActions();
    return;
  }
  target.innerHTML = issues.map((issue) => `
    <article class="issue-card ${escapeHtml(issue.category)} ${issue.id === state.activeIssueId ? "active-card" : ""}" data-card-id="${issue.id}">
      <div class="issue-meta">
        <span class="category">${escapeHtml(categoryLabel(issue.category))} · p.${issue.page}</span>
        <span class="status-chip ${escapeHtml(issue.status)}">${escapeHtml(issue.status.replaceAll("_", " "))}</span>
        ${renderCandidateSelector(issue)}
      </div>
      <div class="issue-change">
        <code class="issue-source">${escapeHtml(issue.source_text)}</code><span>→</span>
        <code class="issue-replacement">${escapeHtml(issue.replacement || "Review")}</code>
      </div>
      <p class="issue-explanation">${escapeHtml(issue.explanation_en)}</p>
      <p class="issue-explanation issue-ko">${escapeHtml(issue.explanation_ko)}</p>
      <p class="issue-context">${escapeHtml(issue.context_text)}</p>
      <div class="issue-details"><span>${escapeHtml(issue.severity)} severity</span><span>${Math.round(Number(issue.confidence) * 100)}% confidence</span></div>
      <div class="issue-evidence">
        <span>Engine: ${escapeHtml(issue.engine || "basic")}</span>
        <span>Standard: ${escapeHtml(issue.standard || issue.rule_source || "Internal reviewer rule")}</span>
        <span>Key: ${escapeHtml(issue.rule_id || issue.rule_reference || "")}</span>
        <span>Rule: ${escapeHtml(issue.message || issue.explanation_en || "")}</span>
        <span>Rule Category: ${escapeHtml(issue.rule_category || issue.category || "")}</span>
        <span>Source: ${escapeHtml(issue.reference || issue.rule_source || "Internal reviewer rule")}</span>
        <span>Source Type: ${escapeHtml(issue.source_type || "")}</span>
        <span>Decision: ${escapeHtml(issue.reviewer_decision || "pending")}</span>
      </div>
      <p class="issue-rationale">Reason: ${escapeHtml(issue.rationale || issue.explanation_en || "")}</p>
      <p class="issue-rationale">Reference: ${escapeHtml(issue.reference || issue.rule_source || "")}</p>
      ${issue.bad_example || issue.good_example ? `<p class="issue-rationale">Example: ${escapeHtml(issue.bad_example || "")} → ${escapeHtml(issue.good_example || "")}</p>` : ""}
      <input class="reviewer-comment" data-comment-id="${issue.id}" value="${escapeHtml(issue.reviewer_comment)}" placeholder="Reviewer comment" />
      <div class="issue-actions">
        <button class="accept-btn" data-action="accepted" data-id="${issue.id}">Accept</button>
        <button class="reject-btn" data-action="rejected" data-id="${issue.id}">Reject</button>
        ${FEATURES.manualGlossaryUi ? `<button class="dictionary-btn" data-glossary-issue="${issue.id}">Add to Glossary</button>` : ""}
      </div>
    </article>
  `).join("");
  target.querySelectorAll(".issue-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (!event.target.matches("button, input")) focusIssue(card.dataset.cardId);
    });
  });
  target.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await updateIssue(button.dataset.id, button.dataset.action);
    });
  });
  target.querySelectorAll("[data-glossary-issue]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const issue = state.issues.find((item) => item.id === button.dataset.glossaryIssue);
      if (issue) openGlossaryModal(null, issueGlossaryDefaults(issue));
    });
  });
  target.querySelectorAll("[data-team-candidate-issue]").forEach((checkbox) => {
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selectedTeamCandidateIssueIds.add(checkbox.dataset.teamCandidateIssue);
      else state.selectedTeamCandidateIssueIds.delete(checkbox.dataset.teamCandidateIssue);
      updateTeamCandidateImportButton();
    });
  });
  updateBulkCategoryActions();
  updateTeamCandidateImportButton();
}

function updateBulkCategoryActions() {
  const selectedCategory = $("category-filter").value;
  const enabled = selectedCategory !== "all"
    && reviewVisibleIssueSource().some((issue) =>
      issue.category === selectedCategory && issue.status !== "rejected"
    );
  $("accept-category-btn").disabled = !enabled;
  $("reject-category-btn").disabled = !enabled;
}

function updateTeamCandidateImportButton() {
  const button = $("add-selected-team-standard-btn");
  if (!button) return;
  button.disabled = state.selectedTeamCandidateIssueIds.size === 0;
}

async function bulkUpdateCategory(status) {
  if (!state.documentId) return;
  const category = $("category-filter").value;
  if (category === "all") {
    showToast("Select one Review Results category first.");
    return;
  }
  const count = reviewVisibleIssueSource().filter((issue) => issue.category === category).length;
  if (!count) return;
  const action = status === "accepted" ? "Accept" : "Reject";
  if (!window.confirm(`${action} all ${count} ${category} suggestions?`)) return;
  try {
    const result = await api(`/api/documents/${state.documentId}/issues/bulk`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, status }),
    });
    state.issues.forEach((issue) => {
      if (issue.category === category) issue.status = status;
    });
    renderSummary();
    renderIssueList();
    renderAllHighlights();
    showToast(`${result.updated_count} ${category} suggestions marked as ${status}.`);
  } catch (error) {
    showFailure(error, `${action} category`);
  }
}

function focusIssue(issueId) {
  const issue = state.issues.find((item) => item.id === issueId);
  if (!issue || !state.document) return;
  const pageInfo = state.document.pages[Number(issue.page) - 1];
  const location = {
    document_id: state.documentId,
    page_number: Number(issue.page),
    issue_id: issue.id,
    scroll_offset: clamp(issue.bbox[1] / pageInfo.height, 0, 1),
    zoom_level: state.zoom,
    view_mode: state.viewMode,
    label: shortIssueLabel(issue),
    last_opened_at: new Date().toISOString(),
  };
  navigateToLocation(location);
  renderIssueList();
  document.querySelector(`[data-card-id="${CSS.escape(issueId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function updateIssue(issueId, status) {
  try {
    const comment = document.querySelector(`[data-comment-id="${CSS.escape(issueId)}"]`)?.value || "";
    await api(`/api/issues/${issueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewer_comment: comment }),
    });
    const issue = state.issues.find((item) => item.id === issueId);
    if (issue) {
      issue.status = status;
      issue.reviewer_comment = comment;
    }
    if (status === "needs_review") focusIssue(issueId);
    renderSummary();
    renderIssueList();
    renderAllHighlights();
    showToast(`Suggestion marked as ${status.replaceAll("_", " ")}.`);
  } catch (error) {
    showToast(error.message);
  }
}

async function loadIssues() {
  if (!state.documentId) return;
  state.issues = await api(`/api/documents/${state.documentId}/issues`);
  state.selectedTeamCandidateIssueIds.forEach((issueId) => {
    const issue = state.issues.find((item) => item.id === issueId);
    if (!issue || !canImportIssueAsTeamCandidate(issue)) state.selectedTeamCandidateIssueIds.delete(issueId);
  });
  renderSummary();
  renderIssueList();
  renderAllHighlights();
}

async function loadDictionary() {
  if (!state.document) return;
  const terms = await api(`/api/documents/${encodeURIComponent(state.documentId)}/dictionary`);
  $("dictionary-count").textContent = `${terms.length} terms`;
  $("dictionary-list").innerHTML = terms.length ? terms.slice(0, 8).map((item) => `
    <div class="dictionary-row"><div><strong>${escapeHtml(item.term)}</strong><small>${escapeHtml(item.scope)} · ${escapeHtml(item.term_type || item.kind)}${item.preferred_term ? ` → ${escapeHtml(item.preferred_term)}` : ""}</small></div></div>
  `).join("") : `<div class="hint">No active glossary terms.</div>`;
  if (terms.length > 8) $("dictionary-list").insertAdjacentHTML("beforeend", `<div class="hint">+ ${terms.length - 8} more terms</div>`);
}

async function loadOllamaReviewLog() {
  if (!state.documentId || state.ollamaLogLoading) return;
  state.ollamaLogLoading = true;
  const target = $("ollama-log-list");
  try {
    const params = new URLSearchParams({
      limit: "100",
      document_id: state.documentId,
      action: "OLLAMA_UNIT_REVIEWED",
    });
    const data = await api(`/api/audit?${params}`);
    const events = (data.events || []).slice().reverse();
    target.innerHTML = events.length ? events.map((event) => {
      const status = String(event.status || "").toLocaleLowerCase().replaceAll("_", "-");
      const rowClass = status === "no-findings" ? "no-findings" : (status === "failed" ? "failed" : "");
      return `
        <div class="ollama-log-row ${rowClass}">
          <strong>${escapeHtml(event.status || "UNKNOWN")}</strong>
          · ${escapeHtml(new Date(event.timestamp).toLocaleTimeString())}<br />
          ${escapeHtml(event.detail || "No metadata")}
        </div>
      `;
    }).join("") : `<span class="hint">No Ollama calls recorded for this document.</span>`;
  } catch (error) {
    target.innerHTML = `<span class="hint">${escapeHtml(error.message)}</span>`;
  } finally {
    state.ollamaLogLoading = false;
  }
}

async function loadEngineStatus(probe = false) {
  if (probe && state.engineProbeRunning) return state.engineStatus;
  if (probe) state.engineProbeRunning = true;
  try {
    const status = await api(`/api/engines/status?probe=${probe}`);
    state.engineStatus = status;
    const preflight = status.preflight;
    $("engine-status-list").innerHTML = `
      <span>Style Engine: Vale ${status.vale ? "Local / Ready" : "Optional"}</span>
      <span>Typo Engine: Basic Rules Only</span>
      <span>Context AI: ${escapeHtml(status.ollama.mode)}</span>
      <span class="safe-status">External Data Transfer: ${escapeHtml(preflight?.external_data_transfer || "Disabled")}</span>
    `;
    $("engine-security-warning").classList.toggle("hidden", !status.blocked_external_endpoint);
    const checks = Object.fromEntries((preflight?.checks || []).map((item) => [item.key, item]));
    const fullReviewReady = Boolean(preflight?.full_review_ready);
    const contextReady = [
      "ollama", "model", "cloud", "web_search", "tool_calling",
      "ollama_host", "binding", "storage",
    ].every((key) => checks[key]?.ready);
    const basicReady = Boolean(preflight?.basic_viewer_ready);
    state.reviewCapabilities = {
      full: fullReviewReady,
      basic: basicReady,
      grammar: false,
      context: contextReady,
    };
    const ollamaToggle = document.querySelector('[data-engine-setting="ollama"]');
    if (ollamaToggle) {
      ollamaToggle.disabled = !contextReady;
      if (!contextReady) ollamaToggle.checked = false;
    }
    $("run-full-review-btn").disabled = !fullReviewReady || state.reviewRunning;
    $("run-part-review-btn").disabled = !basicReady || state.reviewRunning;
    const note = $("review-mode-note");
    note.className = `review-mode-note ${fullReviewReady ? "full" : "basic"}`;
    if (fullReviewReady) {
      note.textContent = `Full Review ready — approved model: ${preflight.requested_model}. Custom Review remains available.`;
    } else {
      note.textContent = "Custom Review ready — runs only the selected engines and standards.";
    }
    renderEngineStatusPage(preflight);
    return status;
  } catch (error) {
    showToast(error.message);
    return null;
  } finally {
    if (probe) state.engineProbeRunning = false;
  }
}

function scheduleEngineStatusPoll() {
  window.clearTimeout(state.enginePollTimer);
  state.enginePollTimer = window.setTimeout(async () => {
    await loadEngineStatus(true);
    scheduleEngineStatusPoll();
  }, 12000);
}

function engineRoleDescription(check) {
  const key = String(check.key || check.label || "").toLowerCase();
  if (key.includes("ollama") || key.includes("model")) return "Local AI context review for sentence-level technical wording.";
  if (key.includes("vale")) return "Local style linting for TeamManual terminology, units, captions, warnings, and procedures.";
  if (key.includes("storage")) return "Local storage required for PDFs, OCR, renders, exports, and saved review state.";
  if (key.includes("cloud") || key.includes("web") || key.includes("tool")) return "Security guardrail that blocks unapproved external data transfer.";
  if (key.includes("binding") || key.includes("host")) return "Loopback-only access so review data stays on this PC.";
  return "Supports local review readiness and safe execution.";
}

function renderEngineStatusPage(preflight) {
  if (!preflight) return;
  const overall = $("engine-overall-card");
  overall.className = `engine-overall-card ${preflight.full_review_ready ? "ready" : "blocked"}`;
  overall.textContent = preflight.full_review_ready
    ? `Full Review Ready · Approved model: ${preflight.requested_model}`
    : "Full Review Blocked · Basic Viewer remains available";
  $("engine-check-grid").innerHTML = preflight.checks
    .filter((check) => check.key !== "languagetool")
    .map((check) => `
    <article class="engine-check-card">
      <h3>
        <span>${escapeHtml(check.label)}</span>
        <span class="${check.ready ? "check-ready" : "check-blocked"}">${check.ready ? "READY" : check.status.toUpperCase()}</span>
      </h3>
      <p>${escapeHtml(check.detail)}</p>
      <p class="engine-role"><strong>Role:</strong> ${escapeHtml(engineRoleDescription(check))}</p>
      ${!check.ready && check.fix ? `<p class="fix"><strong>How to fix:</strong> ${escapeHtml(check.fix)}</p>` : ""}
    </article>
  `).join("");
}

async function loadDocument(documentId) {
  state.documentId = documentId;
  state.document = await api(`/api/documents/${documentId}`);
  state.selectedTeamCandidateIssueIds.clear();
  state.currentPage = 1;
  state.activeIssueId = null;
  state.zoom = 1;
  state.viewMode = "one";
  showView("reviewer");
  $("upload-panel").classList.add("hidden");
  $("workspace").classList.remove("hidden");
  renderDocumentInfo();
  await loadIssues();
  await loadDictionary();
  await loadOllamaReviewLog();
  const serverState = await api(`/api/documents/${documentId}/ui-state`);
  const savedLocation = loadUiState(serverState.state, serverState.updated_at);
  if (state.viewMode === "two" && $("pdf-canvas-wrap").clientWidth < 980) {
    state.viewMode = "one";
    if (savedLocation) savedLocation.view_mode = "one";
  }
  renderDocumentPages(false);
  if (savedLocation) restoreLocation(savedLocation, false);
  else {
    state.navigationHistory = [captureLocation()];
    state.historyIndex = 0;
    updateHistoryButtons();
  }
  await loadEngineStatus(true);
  updateDownloadLinks();
  const progress = await loadReviewProgress();
  if (progress?.status === "running") {
    setReviewControlsRunning(true);
    startReviewProgressPolling();
  } else {
    $("review-status").textContent = state.document.review_status === "completed" ? "Review completed" : "Ready to review";
  }
}

async function runReview(mode) {
  if (!state.documentId) return;
  const fullReview = mode === "full";
  const currentEngines = selectedEngineIds();
  const currentStandards = selectedStandardIds();
  const currentInternalStandards = selectedInternalStandardIds();
  const grammar = false;
  const typos = true;
  const context = currentEngines.includes("ollama");
  const selectedChecks = fullReview
    ? [
        { label: "Vale Style", enabled: currentEngines.includes("vale") },
        { label: "Team Manual Standard", enabled: currentInternalStandards.includes("team_manual") },
        { label: "External Publishing Standards", enabled: currentStandards.length > 0 },
        { label: "Context", enabled: context },
      ]
    : [
        { label: "Vale", enabled: currentEngines.includes("vale") },
        { label: "Ollama", enabled: currentEngines.includes("ollama") },
        { label: "Team Manual Standard", enabled: currentInternalStandards.includes("team_manual") },
        { label: "External Publishing Standards", enabled: currentStandards.length > 0 },
      ];
  if (!selectedChecks.some((item) => item.enabled)) {
    showToast("Select at least one review check.");
    return;
  }
  const engineStatus = await loadEngineStatus(true);
  if (fullReview && !engineStatus?.full_review_ready) {
    const error = new Error(
      "Full Review is not ready. Run Custom Review or correct the missing engine conditions."
    );
    error.status = 503;
    showFailure(error, "Full Review readiness");
    return;
  }
  if (!fullReview && !engineStatus?.preflight?.basic_viewer_ready) {
    const error = new Error("Custom Review cannot start until the local Reviewer runtime and storage checks pass.");
    error.status = 503;
    showFailure(error, "Custom Review readiness");
    return;
  }
  const effectiveGrammar = false;
  const effectiveContext = currentEngines.includes("ollama");
  hideNoIssuesFound();
  hideFailure();
  const button = fullReview ? $("run-full-review-btn") : $("run-part-review-btn");
  state.reviewRequestActive = true;
  setReviewControlsRunning(true);
  button.textContent = fullReview ? "Running Full Review…" : "Running Custom Review…";
  $("review-status").textContent = fullReview
    ? "Running Typos, Context, Standards, and Terminology…"
    : `Running available checks: ${selectedChecks.filter((item) => item.enabled).map((item) => item.label).join(", ")}…`;
  renderReviewProgress({
    status: "running",
    stage_label: "Starting review",
    detail: "Sending the review request to the local server.",
    active_engine: "",
    issues_found: 0,
    percent: 0,
    elapsed_seconds: 0,
    eta_seconds: null,
  });
  startReviewProgressPolling();
  try {
    const result = await api(`/api/documents/${state.documentId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grammar: effectiveGrammar,
        typos,
        context: effectiveContext,
        vale_style: currentEngines.includes("vale"),
        team_rules: currentInternalStandards.includes("team_manual"),
        glossary_consistency: currentEngines.includes("glossary"),
        chicago_derived: false,
        oxford_derived: false,
        microsoft_style: false,
        google_style: false,
        write_good: false,
        proselint: false,
        profile_id: state.activeProfileId,
        enabled_standards: currentStandards,
        enabled_engines: currentEngines,
        engines: selectedEngineFlags(),
        internal_standards: selectedInternalStandardFlags(),
        external_standards: selectedExternalStandardFlags(),
        severity_threshold: "minor",
        use_languagetool: false,
        use_ollama: effectiveContext,
        secure_part_review: false,
        ollama_model: "qwen2.5:7b",
        review_mode: "corrections_and_refinements",
        max_pages: Math.min(300, state.document.page_count),
        language: "en-US",
      }),
    });
    await loadIssues();
    await loadOllamaReviewLog();
    hideFailure();
    if (result.outcome === "no_issues" || result.issue_count === 0) {
      $("review-status").textContent = `Completed — No issues found on ${result.reviewed_pages} pages`;
      showNoIssuesFound(result, selectedChecks);
    } else {
      $("review-status").textContent = `Completed: ${result.issue_count} suggestions on ${result.reviewed_pages} pages`;
      showToast(result.warnings?.length ? result.warnings.join(" ") : "Review complete.");
    }
  } catch (error) {
    hideNoIssuesFound();
    $("review-status").textContent = "Review failed";
    showFailure(error, "English review");
  } finally {
    state.reviewRequestActive = false;
    stopReviewProgressPolling();
    const finalProgress = await loadReviewProgress();
    await loadOllamaReviewLog();
    if (finalProgress?.status === "running") {
      setReviewControlsRunning(true);
      startReviewProgressPolling();
    } else {
      setReviewControlsRunning(false);
    }
    button.textContent = fullReview ? "Run Full Review" : "Run Custom Review";
  }
}

async function runCurrentPageOcr() {
  if (!state.documentId) return;
  const button = $("run-ocr-btn");
  button.disabled = true;
  button.textContent = "Running local OCR…";
  try {
    const result = await api(`/api/documents/${state.documentId}/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pages: [state.currentPage], language: "eng" }),
    });
    hideFailure();
    showToast(result.ocr_pages.length ? `OCR completed for page ${state.currentPage}.` : `Page ${state.currentPage} already contains extractable text.`);
  } catch (error) {
    showFailure(error, "OCR");
  } finally {
    button.disabled = false;
    button.textContent = "OCR current page";
  }
}

async function deleteDocumentTarget(target) {
  if (!state.documentId) return;
  const descriptions = {
    original: "Delete the original PDF, rendered page images, and OCR text?",
    "review-results": "Delete all review results and statuses for this document?",
    "generated-files": "Delete rendered images, OCR files, CSV, JSON, and annotated PDF files?",
    all: "Delete all data for this document?\n\nThis will delete:\n- Original PDF\n- Rendered page images\n- OCR text\n- Review results\n- Annotated PDF\n- CSV and JSON exports",
  };
  if (!window.confirm(descriptions[target])) return;
  try {
    await api(`/api/documents/${state.documentId}/data/${target}`, { method: "DELETE" });
    if (target === "all") {
      localStorage.removeItem(uiStorageKey());
      state.documentId = null;
      state.document = null;
      state.issues = [];
      $("workspace").classList.add("hidden");
      $("upload-panel").classList.remove("hidden");
      updateDownloadLinks();
    } else if (target === "review-results") {
      state.issues = [];
      renderSummary();
      renderIssueList();
      renderAllHighlights();
    } else {
      renderDocumentPages(false);
    }
    showToast("Selected local document data deleted.");
  } catch (error) {
    showToast(error.message);
  }
}

function projectOptions(selected = "") {
  return state.projects.map((project) => `<option value="${escapeHtml(project)}" ${project === selected ? "selected" : ""}>${escapeHtml(project)}</option>`).join("");
}

function manualOptions(selected = "") {
  return state.workspaces.map((manual) => (
    `<option value="${escapeHtml(manual.id)}" ${manual.id === selected ? "selected" : ""}>${escapeHtml(manual.filename)}</option>`
  )).join("");
}

async function loadGlossaryManuals(selected = "") {
  state.workspaces = await api("/api/documents");
  const chosen = selected || state.documentId || state.workspaces[0]?.id || "";
  $("glossary-project").innerHTML = manualOptions(chosen);
  $("term-project").innerHTML = manualOptions(chosen);
  if (chosen) {
    $("glossary-project").value = chosen;
    $("term-project").value = chosen;
  }
}

async function loadProjects(selected = "") {
  state.projects = await api("/api/projects");
  const documentProjects = state.projects.filter((project) => project !== "Common Glossary");
  $("project-list").innerHTML = documentProjects.map((project) => `<option value="${escapeHtml(project)}"></option>`).join("");
  await loadGlossaryManuals(selected || state.documentId || "");
}

function showView(view) {
  state.currentView = view;
  const reviewerVisible = view === "reviewer";
  if (view === "glossary" && !FEATURES.manualGlossaryUi) view = "team-standard";
  state.currentView = view;
  $("glossary-view").classList.toggle("hidden", view !== "glossary");
  $("team-standard-view").classList.toggle("hidden", view !== "team-standard");
  $("workspaces-view").classList.toggle("hidden", view !== "workspaces");
  $("engine-status-view").classList.toggle("hidden", view !== "engines");
  $("upload-panel").classList.toggle("hidden", !reviewerVisible || Boolean(state.documentId));
  $("workspace").classList.toggle("hidden", !reviewerVisible || !state.documentId);
  document.querySelectorAll(".nav-btn").forEach((button) => button.classList.remove("active"));
  const navButton = $(`nav-${view}`);
  if (navButton) navButton.classList.add("active");
  $("open-upload-btn").classList.toggle("hidden", !reviewerVisible);
  updateDownloadLinks();
  if (view === "glossary") loadGlossary();
  if (view === "team-standard") loadTeamStandardRules();
  if (view === "workspaces") loadWorkspaces();
  if (view === "engines") loadEngineStatus(true);
}


async function loadTeamStandardRules() {
  const data = await api("/api/team-manual-standard/rules");
  state.teamStandardRules = data.items || [];
  renderTeamStandardRules();
}

function resetTeamStandardForm() {
  $("team-standard-form").reset();
  $("team-standard-rule-id").value = "";
  $("team-standard-category").value = "consistency";
  $("team-standard-severity").value = "warning";
  $("team-standard-approval-status").value = "candidate";
  $("team-standard-enabled").checked = true;
  $("team-standard-validation-output").textContent = "";
}

function teamStandardPayload() {
  return {
    rule_key: $("team-standard-rule-key").value.trim(),
    title: $("team-standard-title").value.trim(),
    description: $("team-standard-description").value.trim(),
    category: $("team-standard-category").value.trim(),
    matcher_type: "regex",
    pattern: $("team-standard-pattern").value.trim(),
    replacement: $("team-standard-replacement").value.trim(),
    message: $("team-standard-message").value.trim(),
    severity: $("team-standard-severity").value.trim(),
    enabled: $("team-standard-enabled").checked,
    approval_status: $("team-standard-approval-status").value,
  };
}

function editTeamStandardRule(id) {
  const rule = state.teamStandardRules.find((item) => String(item.id) === String(id));
  if (!rule) return;
  $("team-standard-rule-id").value = rule.id;
  $("team-standard-rule-key").value = rule.rule_key || "";
  $("team-standard-title").value = rule.title || "";
  $("team-standard-description").value = rule.description || "";
  $("team-standard-category").value = rule.category || "consistency";
  $("team-standard-severity").value = rule.severity || "warning";
  $("team-standard-pattern").value = rule.pattern || "";
  $("team-standard-replacement").value = rule.replacement || "";
  $("team-standard-message").value = rule.message || "";
  $("team-standard-approval-status").value = rule.approval_status || "candidate";
  $("team-standard-enabled").checked = Boolean(rule.enabled);
}

async function setTeamStandardStatus(id, enabled, approvalStatus) {
  await api(`/api/team-manual-standard/rules/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled, approval_status: approvalStatus }),
  });
  await loadTeamStandardRules();
}

function renderTeamStandardRules() {
  const body = $("team-standard-table-body");
  if (!body) return;
  body.innerHTML = state.teamStandardRules.length ? state.teamStandardRules.map((rule) => `
    <tr>
      <td class="term-cell">${escapeHtml(rule.rule_key || "")}</td>
      <td>${escapeHtml(rule.title || "")}</td>
      <td>${escapeHtml(rule.approval_status || "")}</td>
      <td>${rule.enabled ? "Yes" : "No"}</td>
      <td>${escapeHtml(rule.source_path || rule.source_type || "database")}</td>
      <td>
        <button class="secondary compact-btn" data-team-standard-edit="${rule.id}">Edit</button>
        <button class="secondary compact-btn" data-team-standard-toggle="${rule.id}">${rule.enabled ? "Disable" : "Enable"}</button>
        <button class="secondary compact-btn" data-team-standard-archive="${rule.id}">Archive</button>
      </td>
    </tr>
  `).join("") : `<tr><td class="empty-table" colspan="6">No Team Manual Standard rules.</td></tr>`;
  body.querySelectorAll("[data-team-standard-edit]").forEach((button) => button.addEventListener("click", () => editTeamStandardRule(button.dataset.teamStandardEdit)));
  body.querySelectorAll("[data-team-standard-toggle]").forEach((button) => {
    button.addEventListener("click", async () => {
      const rule = state.teamStandardRules.find((item) => String(item.id) === String(button.dataset.teamStandardToggle));
      if (rule) await setTeamStandardStatus(rule.id, !rule.enabled, rule.approval_status || "candidate");
    });
  });
  body.querySelectorAll("[data-team-standard-archive]").forEach((button) => button.addEventListener("click", () => setTeamStandardStatus(button.dataset.teamStandardArchive, false, "archived")));
}

async function validateTeamStandardRule() {
  const payload = teamStandardPayload();
  payload.sample_text = $("team-standard-sample").value;
  const result = await api("/api/team-manual-standard/rules/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  $("team-standard-validation-output").textContent = JSON.stringify(result, null, 2);
}

async function saveTeamStandardRule(event) {
  event.preventDefault();
  const id = $("team-standard-rule-id").value;
  await api(id ? `/api/team-manual-standard/rules/${id}` : "/api/team-manual-standard/rules", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(teamStandardPayload()),
  });
  resetTeamStandardForm();
  await loadTeamStandardRules();
  showToast("Team Manual Standard rule saved.");
}

async function showTeamStandardMigrationReport() {
  const report = await api("/api/team-manual-standard/migration-report");
  $("team-standard-validation-output").textContent = JSON.stringify(report, null, 2);
}

function workspaceProgress(item) {
  if (!item.issue_count) return item.review_status === "completed" ? "Review complete" : "Not reviewed";
  return `${item.reviewed_issue_count} / ${item.issue_count} suggestions decided`;
}

function renderWorkspaces() {
  const query = $("workspace-search").value.trim().toLocaleLowerCase();
  const items = state.workspaces.filter((item) => (
    item.filename.toLocaleLowerCase().includes(query)
    || item.project_name.toLocaleLowerCase().includes(query)
  ));
  $("workspace-list").innerHTML = items.length ? items.map((item) => `
    <article class="workspace-card">
      <div class="workspace-card-main">
        <span class="term-status ${item.review_status === "completed" ? "active" : "disabled"}">${escapeHtml(item.review_status.replaceAll("_", " "))}</span>
        <h3>${escapeHtml(item.filename)}</h3>
        <p>${escapeHtml(item.project_name)} · ${item.page_count} pages · ${escapeHtml(item.reviewer)}</p>
      </div>
      <div class="workspace-progress">
        <strong>${escapeHtml(workspaceProgress(item))}</strong>
        <span>${item.progress_saved_at ? `Progress saved ${escapeHtml(new Date(item.progress_saved_at).toLocaleString())}` : `Created ${escapeHtml(new Date(item.created_at).toLocaleString())}`}</span>
      </div>
      <div class="workspace-actions">
        <button class="primary" data-open-workspace="${item.id}" ${item.original_available ? "" : "disabled"}>${item.progress_saved_at ? "Resume Workspace" : "Open Workspace"}</button>
        <button class="danger" data-delete-workspace="${item.id}">Delete Workspace</button>
      </div>
    </article>
  `).join("") : `<div class="empty-issues">No saved workspaces match this search.</div>`;
  $("workspace-list").querySelectorAll("[data-open-workspace]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await loadDocument(button.dataset.openWorkspace);
        hideFailure();
      } catch (error) {
        showFailure(error, "Open workspace");
      }
    });
  });
  $("workspace-list").querySelectorAll("[data-delete-workspace]").forEach((button) => {
    button.addEventListener("click", () => deleteWorkspace(button.dataset.deleteWorkspace));
  });
}

async function loadWorkspaces() {
  try {
    state.workspaces = await api("/api/documents");
    renderWorkspaces();
  } catch (error) {
    showFailure(error, "Load workspaces");
  }
}

async function deleteWorkspace(documentId) {
  const workspace = state.workspaces.find((item) => item.id === documentId);
  if (!workspace) return;
  const confirmed = window.confirm(
    `Delete this workspace and all local data?\n\n${workspace.filename}\nProject: ${workspace.project_name}\n\nThis deletes the original PDF, review results, OCR text, rendered pages, exports, and saved progress.`
  );
  if (!confirmed) return;
  try {
    const result = await api(`/api/documents/${documentId}/data/all`, { method: "DELETE" });
    localStorage.removeItem(`pdf-reviewer-ui:${documentId}`);
    if (state.documentId === documentId) {
      state.documentId = null;
      state.document = null;
      state.issues = [];
      updateDownloadLinks();
    }
    await loadWorkspaces();
    hideFailure();
    if (result.failed_removals?.length) {
      showToast("Workspace deleted. Some locked local files may need cleanup after closing Reviewer.");
    } else {
      showToast("Workspace and all associated local data were deleted.");
    }
  } catch (error) {
    showFailure(error, "Delete workspace");
  }
}

function goToPage(pageNumber, label = "Page navigation") {
  if (!state.document) return;
  const page = clamp(Number(pageNumber || 1), 1, state.document.page_count);
  const location = {
    ...captureLocation(),
    page_number: page,
    issue_id: null,
    scroll_offset: 0,
    label,
    last_opened_at: new Date().toISOString(),
  };
  navigateToLocation(location);
}

function formatUpdatedDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

async function loadGlossary() {
  if (!state.workspaces.length) await loadGlossaryManuals(state.documentId || "");
  const documentId = $("glossary-project").value || state.documentId || "";
  if (!documentId) {
    state.glossaryItems = [];
    renderGlossaryTable({ items: [], counts: { common: 0, manual: 0, total: 0 } });
    return;
  }
  const [sort, order] = $("glossary-sort").value.split(":");
  const params = new URLSearchParams({
    document_id: documentId,
    scope: $("glossary-scope").value,
    search: $("glossary-search").value.trim(),
    sort,
    order,
  });
  if ($("glossary-type-filter").value) params.set("term_type", $("glossary-type-filter").value);
  if ($("glossary-status-filter").value) params.set("active", $("glossary-status-filter").value);
  try {
    const data = await api(`/api/glossary?${params}`);
    state.glossaryItems = data.items;
    renderGlossaryTable(data);
  } catch (error) {
    showToast(error.message);
  }
}

function exportGlossaryExcel() {
  exportGlossary("xlsx");
}

function exportGlossary(format) {
  const documentId = $("glossary-project").value || state.documentId || "";
  if (!documentId) {
    showToast("Open or select a manual PDF first.");
    return;
  }
  if (format === "db") {
    window.open(`/api/glossary/export.db?document_id=${encodeURIComponent(documentId)}`, "_blank");
    return;
  }
  const [sort, order] = $("glossary-sort").value.split(":");
  const params = new URLSearchParams({
    document_id: documentId,
    scope: $("glossary-scope").value,
    search: $("glossary-search").value.trim(),
    sort,
    order,
  });
  if ($("glossary-type-filter").value) params.set("term_type", $("glossary-type-filter").value);
  if ($("glossary-status-filter").value) params.set("active", $("glossary-status-filter").value);
  window.open(`/api/glossary/export.${format}?${params}`, "_blank");
}

function renderGlossaryTable(data) {
  const body = $("glossary-table-body");
  body.innerHTML = data.items.length ? data.items.map((item) => `
    <tr>
      <td><span class="scope-badge">${escapeHtml(item.scope)}</span></td>
      <td><span class="type-badge ${escapeHtml(item.term_type)}">${escapeHtml(item.term_type)}</span></td>
      <td class="term-cell">${escapeHtml(item.source_term)}</td>
      <td>${escapeHtml(item.preferred_term || "—")}</td>
      <td class="description-cell">${escapeHtml(item.description || "—")}</td>
      <td>${item.case_sensitive ? "Yes" : "No"}</td>
      <td><span class="term-status ${item.active ? "active" : "disabled"}">${item.active ? "Active" : "Disabled"}</span></td>
      <td>${formatUpdatedDate(item.updated_at)}</td>
      <td><div class="row-actions"><button data-edit-term="${item.id}">Edit</button><button data-toggle-term="${item.id}" data-active="${item.active}">${item.active ? "Disable" : "Enable"}</button><button class="danger-action" data-delete-term="${item.id}">Delete</button></div></td>
    </tr>
  `).join("") : `<tr><td class="empty-table" colspan="9">No glossary terms match these filters.</td></tr>`;
  const manualName = $("glossary-project").selectedOptions[0]?.textContent || "Manual";
  $("glossary-summary").textContent = `Applied terms: Common ${data.counts.common || 0} + ${manualName} ${data.counts.manual ?? data.counts.project ?? 0} = Total ${data.counts.total}`;
  body.querySelectorAll("[data-edit-term]").forEach((button) => button.addEventListener("click", () => openGlossaryModal(state.glossaryItems.find((item) => item.id === button.dataset.editTerm))));
  body.querySelectorAll("[data-toggle-term]").forEach((button) => button.addEventListener("click", () => toggleGlossaryTerm(button.dataset.toggleTerm, button.dataset.active !== "true")));
  body.querySelectorAll("[data-delete-term]").forEach((button) => button.addEventListener("click", () => deleteGlossaryTerm(button.dataset.deleteTerm)));
}

function updatePreferredRequirement() {
  $("term-preferred").required = document.querySelector('input[name="term_type"]:checked').value !== "protected";
}


function issueGlossaryDefaults(issue) {
  const sameSource = state.issues.filter((item) => item.source_text === issue.source_text);
  const engineSuggestions = sameSource.map((item) => ({
    issue_id: item.id,
    engine: item.engine || "basic",
    standard: item.standard || item.rule_source || "Internal reviewer rule",
    rule_id: item.rule_id || item.rule_reference || "",
    category: item.category || "",
    severity: item.severity || "",
    source_text: item.source_text || "",
    replacement: item.replacement || "",
    explanation: item.explanation_en || item.message || "",
    confidence: Number(item.confidence) || 0,
  }));
  return {
    source_term: issue.source_text,
    preferred_term: issue.replacement || "",
    document_id: state.documentId,
    engine_suggestions: engineSuggestions,
    provenance: {
      added_from: "review_results",
      document_id: state.documentId || "",
      filename: state.document?.filename || "",
      source_issue_id: issue.id,
      engines: [...new Set(engineSuggestions.map((item) => item.engine).filter(Boolean))],
      standards: [...new Set(engineSuggestions.map((item) => item.standard).filter(Boolean))],
    },
  };
}

function renderGlossaryProvenance(suggestions = []) {
  const panel = $("glossary-provenance-panel");
  const list = $("glossary-provenance-list");
  if (!suggestions.length) {
    panel.classList.add("hidden");
    list.innerHTML = "";
    return;
  }
  panel.classList.remove("hidden");
  list.innerHTML = suggestions.map((item) => `
    <div class="provenance-row">
      <span>${escapeHtml(item.engine || "basic")} ? ${escapeHtml(item.standard || "Internal reviewer rule")}</span>
      <code>${escapeHtml(item.source_text || "")} ? ${escapeHtml(item.replacement || "Review")}</code>
      <small>${escapeHtml(item.rule_id || "")} ${item.confidence ? `? ${Math.round(Number(item.confidence) * 100)}%` : ""}</small>
    </div>
  `).join("");
}

function openGlossaryModal(item = null, defaults = {}) {
  $("glossary-term-form").reset();
  $("glossary-term-id").value = item?.id || "";
  $("glossary-modal-title").textContent = item ? "Edit Term" : (defaults.source_term ? "Add to Manual Glossary" : "Add Term");
  const documentId = item?.scope === "document" ? item.project_id : (defaults.document_id || state.documentId || $("glossary-project").value || state.workspaces[0]?.id || "");
  $("term-project").innerHTML = manualOptions(documentId);
  $("term-scope").value = item?.scope || "document";
  const type = item?.term_type || "protected";
  document.querySelector(`input[name="term_type"][value="${type}"]`).checked = true;
  $("term-source").value = item?.source_term || defaults.source_term || "";
  $("term-preferred").value = item?.preferred_term || defaults.preferred_term || "";
  $("term-description").value = item?.description || (defaults.source_term ? "Added from PDF review" : "");
  $("term-case-sensitive").checked = Boolean(item?.case_sensitive);
  $("term-active").value = String(item?.active ?? true);
  state.pendingGlossaryMetadata = {
    engine_suggestions: item?.engine_suggestions || defaults.engine_suggestions || [],
    provenance: item?.provenance || defaults.provenance || {},
  };
  renderGlossaryProvenance(state.pendingGlossaryMetadata.engine_suggestions);
  updatePreferredRequirement();
  $("glossary-modal").classList.remove("hidden");
  $("term-source").focus();
}

function closeGlossaryModal() {
  $("glossary-modal").classList.add("hidden");
  state.pendingGlossaryMetadata = { engine_suggestions: [], provenance: {} };
}

function candidateDraftFromIssue(issue) {
  const source = issue.source_text || "";
  return {
    issue_id: issue.id,
    title: `Candidate from ${issue.source_label || issue.engine || "external engine"}`,
    description: `Imported manually from ${issue.source_label || issue.engine || "external engine"} issue ${issue.id}.`,
    category: issue.category || "consistency",
    pattern: source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    replacement: issue.replacement || "",
    message: issue.message || issue.explanation_en || "",
    test_sentence: issue.context_text || source,
    include: true,
  };
}

function openTeamCandidateModal() {
  const selected = [...state.selectedTeamCandidateIssueIds]
    .map((issueId) => state.issues.find((issue) => issue.id === issueId))
    .filter(Boolean)
    .filter(canImportIssueAsTeamCandidate);
  if (!selected.length) {
    showToast("Select at least one external engine finding first.");
    return;
  }
  $("team-candidate-draft-list").innerHTML = selected.map((issue) => {
    const draft = candidateDraftFromIssue(issue);
    return `
      <article class="candidate-draft" data-candidate-draft="${escapeHtml(issue.id)}">
        <label class="checkbox-inline"><input type="checkbox" data-candidate-include checked /> Include</label>
        <div class="issue-evidence">
          <span>Source: ${escapeHtml(issue.source_label || issue.engine || "")}</span>
          <span>Issue: ${escapeHtml(issue.id)}</span>
          <span>Page: ${escapeHtml(issue.page)}</span>
        </div>
        <p class="issue-context">${escapeHtml(issue.context_text || "")}</p>
        <label>Matched span<input data-candidate-source readonly value="${escapeHtml(issue.source_text || "")}" /></label>
        <label>Title<input data-candidate-title value="${escapeHtml(draft.title)}" /></label>
        <label>Category<input data-candidate-category value="${escapeHtml(draft.category)}" /></label>
        <label>Pattern<textarea data-candidate-pattern rows="2">${escapeHtml(draft.pattern)}</textarea></label>
        <label>Replacement<input data-candidate-replacement value="${escapeHtml(draft.replacement)}" /></label>
        <label>Message<textarea data-candidate-message rows="2">${escapeHtml(draft.message)}</textarea></label>
        <label>Description<textarea data-candidate-description rows="2">${escapeHtml(draft.description)}</textarea></label>
        <label>Test Sentence<textarea data-candidate-test rows="2">${escapeHtml(draft.test_sentence)}</textarea></label>
      </article>
    `;
  }).join("");
  $("team-candidate-modal").classList.remove("hidden");
}

function closeTeamCandidateModal() {
  $("team-candidate-modal").classList.add("hidden");
}

function collectTeamCandidateDrafts() {
  return [...document.querySelectorAll("[data-candidate-draft]")].map((card) => ({
    issue_id: card.dataset.candidateDraft,
    include: card.querySelector("[data-candidate-include]").checked,
    title: card.querySelector("[data-candidate-title]").value.trim(),
    description: card.querySelector("[data-candidate-description]").value.trim(),
    category: card.querySelector("[data-candidate-category]").value.trim(),
    pattern: card.querySelector("[data-candidate-pattern]").value.trim(),
    replacement: card.querySelector("[data-candidate-replacement]").value.trim(),
    message: card.querySelector("[data-candidate-message]").value.trim(),
    test_sentence: card.querySelector("[data-candidate-test]").value.trim(),
  })).filter((draft) => draft.include);
}

async function saveTeamCandidates() {
  const drafts = collectTeamCandidateDrafts();
  if (!drafts.length) {
    showToast("No candidate drafts selected.");
    return;
  }
  const result = await api("/api/team-manual-standard/candidates/from-issues", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ drafts }),
  });
  state.selectedTeamCandidateIssueIds.clear();
  closeTeamCandidateModal();
  await loadIssues();
  showToast(`${result.created.length} candidate rule(s) saved. ${result.skipped.length ? `${result.skipped.length} skipped.` : ""}`);
}

async function toggleGlossaryTerm(termId, active) {
  try {
    await api(`/api/glossary/${termId}/active`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
    await loadGlossary();
    if (state.document) await loadDictionary();
    showToast(active ? "Glossary term enabled." : "Glossary term disabled.");
  } catch (error) { showToast(error.message); }
}

async function deleteGlossaryTerm(termId) {
  const item = state.glossaryItems.find((term) => term.id === termId);
  if (!item || !window.confirm(`Delete this glossary term?\n\nSource Term: ${item.source_term}\nPreferred Term: ${item.preferred_term || "—"}\n\nThis term will no longer be applied to future reviews.`)) return;
  try {
    await api(`/api/glossary/${termId}`, { method: "DELETE" });
    await loadGlossary();
    if (state.document) await loadDictionary();
    showToast("Glossary term deleted.");
  } catch (error) { showToast(error.message); }
}

function renderMetricGrid(targetId, metrics) {
  const target = $(targetId);
  target.innerHTML = metrics.map(([label, value]) => `
    <article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? "")}</strong></article>
  `).join("");
}

function attachEventHandlers() {
  $("pdf-file").addEventListener("change", (event) => {
    $("selected-file").textContent = event.target.files?.[0]?.name || "No file selected";
  });
  $("upload-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector("button[type=submit]");
    submit.disabled = true;
    submit.textContent = "Validating and uploading…";
    try {
      const result = await api("/api/documents", { method: "POST", body: new FormData(event.currentTarget) });
      await loadDocument(result.document_id);
      hideFailure();
      showToast("PDF validated and stored locally.");
    } catch (error) { showFailure(error, "PDF upload"); }
    finally { submit.disabled = false; submit.textContent = "Open review workspace"; }
  });
  $("run-full-review-btn").addEventListener("click", () => runReview("full"));
  $("run-part-review-btn").addEventListener("click", () => runReview("part"));
  $("add-selected-team-standard-btn").addEventListener("click", openTeamCandidateModal);
  $("close-team-candidate-modal").addEventListener("click", closeTeamCandidateModal);
  $("cancel-team-candidate-modal").addEventListener("click", closeTeamCandidateModal);
  $("save-team-candidates-btn").addEventListener("click", saveTeamCandidates);
  $("review-profile-select").addEventListener("change", () => applyProfileToSettings($("review-profile-select").value));
  $("refresh-ollama-log-btn").addEventListener("click", loadOllamaReviewLog);
  $("recheck-workspace-engines-btn").addEventListener("click", async () => {
    const button = $("recheck-workspace-engines-btn");
    button.disabled = true;
    button.textContent = "Checking local engines…";
    await loadEngineStatus(true);
    button.disabled = false;
    button.textContent = "Recheck engines now";
  });
  $("run-ocr-btn").addEventListener("click", runCurrentPageOcr);
  $("pdf-canvas-wrap").addEventListener("scroll", () => {
    window.clearTimeout(state.scrollTimer);
    state.scrollTimer = window.setTimeout(updateCurrentPageFromScroll, 60);
  });
  $("pdf-canvas-wrap").addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoom(state.zoom + (event.deltaY < 0 ? 0.1 : -0.1));
  }, { passive: false });
  $("zoom-out-btn").addEventListener("click", () => setZoom(state.zoom - 0.1));
  $("zoom-in-btn").addEventListener("click", () => setZoom(state.zoom + 0.1));
  $("reset-zoom-btn").addEventListener("click", () => setZoom(1));
  $("fit-width-btn").addEventListener("click", fitWidth);
  $("fit-page-btn").addEventListener("click", fitPage);
  $("one-page-mode-btn").addEventListener("click", () => setViewMode("one"));
  $("two-page-mode-btn").addEventListener("click", () => setViewMode("two"));
  $("page-number-input").addEventListener("change", () => goToPage($("page-number-input").value, "Manual page jump"));
  $("previous-page-btn").addEventListener("click", () => goToPage(state.currentPage - 1));
  $("next-page-btn").addEventListener("click", () => goToPage(state.currentPage + 1));
  $("history-back-btn").addEventListener("click", () => moveHistory(-1));
  $("history-forward-btn").addEventListener("click", () => moveHistory(1));
  $("save-progress-btn").addEventListener("click", saveProgress);
  $("text-selection-btn").addEventListener("click", toggleTextSelectionMode);
  $("category-filter").addEventListener("change", renderIssueList);
  $("engine-filter").addEventListener("change", renderIssueList);
  $("standard-filter").addEventListener("change", renderIssueList);
  $("accept-category-btn").addEventListener("click", () => bulkUpdateCategory("accepted"));
  $("reject-category-btn").addEventListener("click", () => bulkUpdateCategory("rejected"));
  document.querySelectorAll("[data-delete-document]").forEach((button) => button.addEventListener("click", () => deleteDocumentTarget(button.dataset.deleteDocument)));
  $("download-csv-btn").addEventListener("click", () => state.documentId && window.open(`/api/documents/${state.documentId}/export.csv`, "_blank"));
  $("download-json-btn").addEventListener("click", () => state.documentId && window.open(`/api/documents/${state.documentId}/export.json`, "_blank"));
  $("download-pdf-btn").addEventListener("click", () => state.documentId && window.open(`/api/documents/${state.documentId}/export-annotated.pdf`, "_blank"));
  $("open-upload-btn").addEventListener("click", () => {
    showView("reviewer");
    $("workspace").classList.add("hidden");
    $("upload-panel").classList.remove("hidden");
  });
  $("nav-reviewer").addEventListener("click", () => showView("reviewer"));
  $("nav-workspaces").addEventListener("click", () => showView("workspaces"));
  $("nav-team-standard").addEventListener("click", () => showView("team-standard"));
  $("nav-glossary").addEventListener("click", () => showView("glossary"));
  $("nav-engines").addEventListener("click", () => showView("engines"));
  $("recheck-engines-btn").addEventListener("click", async () => {
    const button = $("recheck-engines-btn");
    button.disabled = true;
    button.textContent = "Checking…";
    try {
      await loadEngineStatus(true);
      showToast("Local engine and security status refreshed.");
    } finally {
      button.disabled = false;
      button.textContent = "Recheck";
    }
  });
  $("manage-glossary-btn").addEventListener("click", async () => {
    if (!FEATURES.manualGlossaryUi) return;
    showView("glossary");
    await loadGlossaryManuals(state.documentId || "");
    if (state.documentId) $("glossary-project").value = state.documentId;
    loadGlossary();
  });
  $("add-glossary-btn").addEventListener("click", () => openGlossaryModal());
  $("export-glossary-xlsx-btn").addEventListener("click", exportGlossaryExcel);
  $("export-glossary-txt-btn").addEventListener("click", () => exportGlossary("txt"));
  $("export-glossary-db-btn").addEventListener("click", () => exportGlossary("db"));
  if ($("new-project-btn")) {
    $("new-project-btn").addEventListener("click", () => {
      $("project-form").reset();
      $("project-modal").classList.remove("hidden");
      $("new-project-name").focus();
    });
  }
  $("close-glossary-modal").addEventListener("click", closeGlossaryModal);
  $("cancel-glossary-modal").addEventListener("click", closeGlossaryModal);
  $("close-project-modal").addEventListener("click", () => $("project-modal").classList.add("hidden"));
  $("cancel-project-modal").addEventListener("click", () => $("project-modal").classList.add("hidden"));
  document.querySelectorAll('input[name="term_type"]').forEach((input) => input.addEventListener("change", updatePreferredRequirement));
  ["glossary-project", "glossary-scope", "glossary-type-filter", "glossary-status-filter", "glossary-sort"].forEach((id) => $(id).addEventListener("change", loadGlossary));
  $("glossary-search").addEventListener("input", () => {
    window.clearTimeout(loadGlossary.searchTimer);
    loadGlossary.searchTimer = window.setTimeout(loadGlossary, 220);
  });
  $("glossary-modal").addEventListener("click", (event) => event.target === $("glossary-modal") && closeGlossaryModal());
  $("project-modal").addEventListener("click", (event) => event.target === $("project-modal") && $("project-modal").classList.add("hidden"));
  $("workspace-search").addEventListener("input", renderWorkspaces);
  $("refresh-workspaces-btn").addEventListener("click", loadWorkspaces);
  $("workspace-upload-btn").addEventListener("click", () => {
    state.documentId = null;
    state.document = null;
    showView("reviewer");
  });
  $("close-failure-panel").addEventListener("click", hideFailure);
  $("run-diagnostics-btn").addEventListener("click", runDiagnostics);
  $("close-no-issues-modal").addEventListener("click", hideNoIssuesFound);
  $("no-issues-modal").addEventListener("click", (event) => {
    if (event.target === $("no-issues-modal")) hideNoIssuesFound();
  });
  $("acknowledge-storage-notice").addEventListener("click", () => {
    localStorage.setItem("pdf-reviewer-storage-notice-v1", "acknowledged");
    $("storage-notice-modal").classList.add("hidden");
  });
  window.addEventListener("resize", () => {
    if (state.viewMode === "two" && $("pdf-canvas-wrap").clientWidth < 980) setViewMode("one");
  });
  window.addEventListener("beforeunload", saveUiState);
}

$("glossary-term-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const termId = $("glossary-term-id").value;
  const payload = {
    project_id: $("term-project").value,
    document_id: $("term-project").value,
    scope: $("term-scope").value,
    term_type: document.querySelector('input[name="term_type"]:checked').value,
    source_term: $("term-source").value.trim(),
    preferred_term: $("term-preferred").value.trim(),
    description: $("term-description").value.trim(),
    case_sensitive: $("term-case-sensitive").checked,
    active: $("term-active").value === "true",
    engine_suggestions: state.pendingGlossaryMetadata.engine_suggestions || [],
    provenance: state.pendingGlossaryMetadata.provenance || {},
  };
  try {
    await api(termId ? `/api/glossary/${termId}` : "/api/glossary", {
      method: termId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    closeGlossaryModal();
    await loadProjects(payload.project_id);
    if (payload.scope === "document") $("glossary-project").value = payload.document_id;
    await loadGlossary();
    if (state.document) await loadDictionary();
    showToast(termId ? "Glossary term updated." : "Glossary term added.");
  } catch (error) { showToast(error.message); }
});

$("project-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: $("new-project-name").value.trim() }),
    });
    $("project-modal").classList.add("hidden");
    await loadProjects(result.name);
    await loadGlossaryManuals(state.documentId || "");
    $("glossary-scope").value = "document";
    await loadGlossary();
    showToast(`Project created${result.seeded_terms ? ` with ${result.seeded_terms} starter terms` : ""}.`);
  } catch (error) { showToast(error.message); }
});

async function initialize() {
  attachEventHandlers();
  try {
    await loadReviewSettings();
    await loadProjects();
    await loadEngineStatus(true);
    scheduleEngineStatusPoll();
  } catch (error) {
    showToast(error.message);
  }
  if (!localStorage.getItem("pdf-reviewer-storage-notice-v1")) {
    $("storage-notice-modal").classList.remove("hidden");
  }
}

initialize();

