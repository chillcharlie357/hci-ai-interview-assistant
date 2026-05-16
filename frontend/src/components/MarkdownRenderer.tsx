import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./MarkdownRenderer.css";

interface MarkdownRendererProps {
  content: string;
  maxHeight?: string;
  className?: string;
}

export function MarkdownRenderer({ content, maxHeight, className }: MarkdownRendererProps) {
  return (
    <div
      className={`markdown-renderer ${className ?? ""}`}
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
