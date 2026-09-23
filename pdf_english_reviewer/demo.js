// Client-side preview shim for TW/pdf_english_reviewer.
// The real app POSTs uploads to a FastAPI backend. On GitHub Pages the
// backend isn't available, so this file intercepts the upload form and
// renders the selected PDF locally with PDF.js.

(function () {
  const PDFJS_VERSION = "4.0.379";
  const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

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

  function ensurePdfjs() {
    if (pdfjsReady) return pdfjsReady;
    pdfjsReady = loadScript(`${PDFJS_BASE}/pdf.min.js`).then(() => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
    });
    return pdfjsReady;
  }

  // Kick off PDF.js download immediately so it's ready by the time the
  // user picks a file.
  ensurePdfjs().catch((err) => console.warn("[demo] PDF.js preload failed:", err));

  // Capture-phase submit interception: runs before the form's own submit
  // handler (added by app_v3.js), so we can preventDefault + stopImmediatePropagation
  // and route to the local renderer instead of the missing backend.
  document.addEventListener(
    "submit",
    async (event) => {
      const form = event.target;
      if (!form || form.id !== "upload-form") return;
      event.preventDefault();
      event.stopImmediatePropagation();

      const fileInput = document.getElementById("pdf-file");
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
        const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
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
    true // capture phase
  );

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
          Rendered locally in your browser via PDF.js. Review suggestions, glossary, and CSV/PDF exports require running the local FastAPI backend.
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
})();
