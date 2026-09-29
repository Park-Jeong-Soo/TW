// A4 display geometry shared by the preview and backend-powered viewer.
(function (root) {
  const A4_WIDTH = 595.28;
  const A4_HEIGHT = 841.89;

  function a4PageLayout(sourceWidth, sourceHeight, viewerWidth, zoom = 1, twoPage = false) {
    if (!(sourceWidth > 0) || !(sourceHeight > 0)) throw new Error("Invalid PDF page size");
    const landscape = sourceWidth > sourceHeight;
    const a4Width = landscape ? A4_HEIGHT : A4_WIDTH;
    const a4Height = landscape ? A4_WIDTH : A4_HEIGHT;
    const usableWidth = Math.max(240, (viewerWidth || 800) - 80);
    const fitWidth = twoPage ? Math.max(220, (usableWidth - 24) / 2) : usableWidth;
    const paperWidth = Math.min(a4Width, fitWidth) * zoom;
    const paperHeight = paperWidth * a4Height / a4Width;
    const contentScale = Math.min(paperWidth / sourceWidth, paperHeight / sourceHeight);
    const contentWidth = sourceWidth * contentScale;
    const contentHeight = sourceHeight * contentScale;
    return {
      paperWidth, paperHeight, contentWidth, contentHeight, contentScale,
      offsetX: (paperWidth - contentWidth) / 2,
      offsetY: (paperHeight - contentHeight) / 2,
    };
  }

  root.a4PageLayout = a4PageLayout;
  if (typeof module !== "undefined") module.exports = { a4PageLayout };
})(typeof window !== "undefined" ? window : globalThis);
