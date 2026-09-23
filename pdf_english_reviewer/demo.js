// Preview-mode shim for TW/pdf_english_reviewer.
// The real app posts uploads to a FastAPI backend; this file replaces that
// path with client-side PDF.js rendering so the demo actually shows something.

(function () {
  const PDFJS_VERSION = "4.0.379";
  const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

  // Fetch stubbing is done inline in index.html <head> so app_v3.js's initial
  // requests are intercepted. This file only handles PDF.js rendering.
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }

  async function boot() {
    try {
      await loadScript(`${PDFJS_BASE}/pdf.min.js`);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
    } catch (err) {
      console.warn("[demo] PDF.js load failed:", err);
      return;
    }
    rebindUpload();
  }

  function rebindUpload() {
    const form = document.getElementById("upload-form");
    if (!form) return;
    const clone = form.cloneNode(true);
    form.parentNode.replaceChild(clone, form);
    clone.addEventListener("submit", handleSubmit);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.querySelector('input[type="file"]');
    const file = fileInput && fileInput.files && fileInput.files[0];
    const btn = form.querySelector('button[type="submit"]');
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      alert("Please choose a PDF file.");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Rendering preview…";
    try {
      const buffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
      await renderViewer(pdf, file.name);
    } catch (err) {
      console.error(err);
      alert("PDF render failed: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Open review workspace";
    }
  }

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
          Preview mode: showing the first ${maxPages} pages rendered in your browser via PDF.js.
          Review suggestions, glossary, Team Manual Standard, and CSV/PDF exports require the local FastAPI backend.
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

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
