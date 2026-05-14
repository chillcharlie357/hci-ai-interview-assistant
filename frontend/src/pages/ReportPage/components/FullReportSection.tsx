import { memo } from "react";

interface FullReportSectionProps {
  report: string;
}

export const FullReportSection = memo(function FullReportSection({ report }: FullReportSectionProps) {
  return (
    <div className="glass-card full-report-card">
      <h3>完整报告</h3>
      <pre className="full-report-content">{report}</pre>
    </div>
  );
});
