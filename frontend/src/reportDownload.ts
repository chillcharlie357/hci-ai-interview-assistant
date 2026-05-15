type AnchorLike = {
  href: string;
  download: string;
  click: () => void;
};

type DownloadDeps = {
  createBlob: (parts: string[], options: { type: string }) => Blob | unknown;
  createObjectURL: (blob: Blob | unknown) => string;
  revokeObjectURL: (url: string) => void;
  createAnchor: () => AnchorLike;
  appendChild: (anchor: AnchorLike) => void;
  removeChild: (anchor: AnchorLike) => void;
};

export function buildReportFilename(candidateName: string, sessionId: string): string {
  const safeCandidate = sanitizeFilenamePart(candidateName) || "candidate";
  const safeSession = sanitizeFilenamePart(sessionId) || "session";
  return `interview-report-${safeCandidate}-${safeSession}.md`;
}

export function buildPdfFilename(candidateName: string, sessionId: string): string {
  const safeCandidate = sanitizeFilenamePart(candidateName) || "candidate";
  const safeSession = sanitizeFilenamePart(sessionId) || "session";
  return `interview-report-${safeCandidate}-${safeSession}.pdf`;
}

/** 将指定的 DOM 容器导出为 PDF 文件并下载 */
export async function downloadPdfReport(
  candidateName: string,
  sessionId: string,
  containerSelector: string,
): Promise<void> {
  const element = document.querySelector(containerSelector) as HTMLElement | null;
  if (!element) return;

  const { default: html2canvas } = await import("html2canvas");
  const { default: jsPDF } = await import("jspdf");

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/png");
  const imgWidth = 210; // A4 width in mm
  const pageHeight = 297; // A4 height in mm
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const pdf = new jsPDF("p", "mm", "a4");
  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(buildPdfFilename(candidateName, sessionId));
}

export function downloadMarkdownReport(filename: string, markdown: string, deps: DownloadDeps = browserDownloadDeps()): void {
  const blob = deps.createBlob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = deps.createObjectURL(blob);
  const anchor = deps.createAnchor();
  anchor.href = url;
  anchor.download = filename;
  deps.appendChild(anchor);
  anchor.click();
  deps.removeChild(anchor);
  deps.revokeObjectURL(url);
}

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function browserDownloadDeps(): DownloadDeps {
  return {
    createBlob: (parts, options) => new Blob(parts, options),
    createObjectURL: (blob) => URL.createObjectURL(blob as Blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement("a"),
    appendChild: (anchor) => document.body.appendChild(anchor as HTMLAnchorElement),
    removeChild: (anchor) => document.body.removeChild(anchor as HTMLAnchorElement)
  };
}
