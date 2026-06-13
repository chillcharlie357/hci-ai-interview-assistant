import { useEffect, useRef, useState, useCallback } from "react";

import type { DigitalInterviewerState } from "@/digitalInterviewer";

const CLIP_SRC: Record<string, string> = {
  smile: "/videos/smile.mp4",
  speak: "/videos/speak.mp4",
  shake: "/videos/shake.mp4",
  nod: "/videos/nod.mp4",
};

interface VideoAvatarProps {
  state: DigitalInterviewerState;
  reaction?: { type: "nod" | "shake"; key: number } | null;
}

export function VideoAvatar({ state, reaction }: VideoAvatarProps) {
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null]);
  const activeRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [retrigger, setRetrigger] = useState(0);
  const nodTimerRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const reactingRef = useRef(false);

  const playClip = useCallback(
    (clipName: string, shouldLoop: boolean, onEnd?: () => void) => {
      const nextIndex = activeRef.current === 0 ? 1 : 0;
      const video = videoRefs.current[nextIndex];
      if (!video) return;

      video.src = CLIP_SRC[clipName] || CLIP_SRC.smile;
      video.loop = shouldLoop;
      video.currentTime = 0;
      video.muted = true;
      video.playsInline = true;

      if (onEnd) {
        video.onended = () => {
          video.onended = null;
          onEnd();
        };
      } else {
        video.onended = null;
      }

      video.play().then(() => {
        activeRef.current = nextIndex;
        setActiveIndex(nextIndex);
      }).catch(() => {
        /* autoplay blocked — acceptable, user gesture will trigger later */
      });
    },
    [],
  );

  const scheduleNod = useCallback(() => {
    nodTimerRef.current = window.setTimeout(() => {
      if (!mountedRef.current) return;
      playClip("nod", false, () => {
        if (mountedRef.current) {
          playClip("smile", true);
          scheduleNod();
        }
      });
    }, 4000 + Math.random() * 5000);
  }, [playClip]);

  /* preload all clips via <link rel="preload"> */
  useEffect(() => {
    Object.entries(CLIP_SRC).forEach(([, src]) => {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "video";
      link.href = src;
      document.head.appendChild(link);
    });
  }, []);

  /* state → clip mapping (skipped when a reaction is playing) */
  useEffect(() => {
    if (reactingRef.current) return;
    clearTimeout(nodTimerRef.current);

    switch (state) {
      case "speaking":
        playClip("speak", true);
        break;
      case "listening":
        playClip("smile", true);
        scheduleNod();
        break;
      default:
        /* preparing / finished / unsupported — static frame of smile */
        playClip("smile", false);
        break;
    }
  }, [state, retrigger, playClip, scheduleNod]);

  /* one-shot reaction clips (nod / shake) — take priority over state */
  useEffect(() => {
    if (!reaction?.type) return;
    reactingRef.current = true;
    clearTimeout(nodTimerRef.current);
    playClip(reaction.type, false, () => {
      reactingRef.current = false;
      setRetrigger((n) => n + 1);
    });
  }, [reaction?.key, playClip]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(nodTimerRef.current);
    };
  }, []);

  return (
    <div className="video-avatar-wrapper">
      <video
        ref={(el) => { videoRefs.current[0] = el; }}
        className={`video-avatar-layer ${activeIndex === 0 ? "visible" : ""}`}
        muted
        playsInline
        preload="auto"
        src={CLIP_SRC.smile}
        loop
      />
      <video
        ref={(el) => { videoRefs.current[1] = el; }}
        className={`video-avatar-layer ${activeIndex === 1 ? "visible" : ""}`}
        muted
        playsInline
        preload="auto"
      />
    </div>
  );
}
