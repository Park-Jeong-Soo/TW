// Text search over extracted PDF items. The caller supplies page and item coordinates.
(function (root) {
  function findPdfTextMatches(pages, query) {
    const needle = String(query || "").trim().toLocaleLowerCase();
    if (!needle) return [];
    const matches = [];
    for (const page of pages) {
      const items = (page.items || []).filter((item) => String(item.text || "").trim());
      const spans = [];
      let text = "";
      for (const item of items) {
        if (text) text += " ";
        spans.push({ start: text.length, end: text.length + item.text.length, item });
        text += item.text;
      }
      const haystack = text.toLocaleLowerCase();
      let from = 0;
      while (from < haystack.length) {
        const index = haystack.indexOf(needle, from);
        if (index < 0) break;
        const first = spans.find((span) => span.end > index);
        if (first) matches.push({ page: page.page, bbox: first.item.bbox, text: text.slice(index, index + needle.length) });
        from = index + Math.max(1, needle.length);
      }
    }
    return matches;
  }
  root.findPdfTextMatches = findPdfTextMatches;
  if (typeof module !== "undefined") module.exports = { findPdfTextMatches };
})(typeof window !== "undefined" ? window : globalThis);
