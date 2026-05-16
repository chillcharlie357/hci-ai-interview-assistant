import { memo } from "react";
import { MarkdownRenderer } from "../../../components/MarkdownRenderer";

interface FullReportSectionProps {
  report: string;
}

export const FullReportSection = memo(function FullReportSection({ report }: FullReportSectionProps) {
  return (
    <div className="glass-card full-report-card">
      <h3>完整报告</h3>
      <MarkdownRenderer content={report} />
    </div>
  );
});
