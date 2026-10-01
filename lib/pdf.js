// Stitches rendered slides into one PDF for LinkedIn's document carousel:
// one page per slide, page size equal to the slide's 1x pixel size, so the
// viewer keeps the exact aspect ratio. A 2x export embeds 2x images on the
// same pages, which only raises their density.
export async function buildPdf(pngs, { width, height, title, author }) {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setAuthor(author);
  pdf.setCreator('بصيرة');
  for (const png of pngs) {
    const image = await pdf.embedPng(png);
    pdf.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
  }
  return pdf.save();
}
