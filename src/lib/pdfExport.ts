import jsPDF from 'jspdf';

export const exportPageAsPDF = (
  canvas: HTMLCanvasElement,
  notebookName: string,
  pageNumber: number
) => {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // A4 dimensions in mm
  const pageWidth = 210;
  const pageHeight = 297;

  const imgData = canvas.toDataURL('image/jpeg', 0.92);
  pdf.addImage(imgData, 'JPEG', 0, 0, pageWidth, pageHeight);

  const safeName = notebookName.replace(/[^a-z0-9]/gi, '_');
  pdf.save(`${safeName}_page${pageNumber}.pdf`);
};
