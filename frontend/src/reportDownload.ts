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
