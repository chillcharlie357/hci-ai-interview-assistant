import { memo, type RefObject } from "react";
import { RobotOutlined, UserOutlined } from "@ant-design/icons";

import type { ConversationCaption } from "@/digitalInterviewer";

interface CaptionBarProps {
  captions: ConversationCaption[];
  scrollRef: RefObject<HTMLDivElement | null>;
}

export const CaptionBar = memo(function CaptionBar({ captions, scrollRef }: CaptionBarProps) {
  return (
    <div className="danmaku-captions">
      <div className="danmaku-scroll" ref={scrollRef} role="log" aria-live="polite" aria-label="对话字幕">
        {captions.map((caption) => (
          <div key={caption.id} className={`caption-bubble ${caption.speaker}`}>
            <div className="caption-header">
              <span className="caption-avatar">
                {caption.speaker === "ai" ? <RobotOutlined /> : <UserOutlined />}
              </span>
              <strong className="caption-name">{caption.label}</strong>
            </div>
            <p className="caption-text">{caption.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
});
