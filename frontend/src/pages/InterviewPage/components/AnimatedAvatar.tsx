import { useState, useEffect, useRef } from "react";

import type { DigitalInterviewerState } from "@/digitalInterviewer";

interface AnimatedAvatarProps {
  state: DigitalInterviewerState;
}

/* ─── geometry constants ─── */
const CX = 36;
const CY = 37;
const EYE_Y = 32;
const LEFT_EYE_X = 27;
const RIGHT_EYE_X = 45;
const NOSE_Y = 40;
const MOUTH_Y = 46;

/* ─── SVG gradient IDs ─── */
const SKIN_GRAD = "skinGrad";
const IRIS_GRAD = "irisGrad";
const HAIR_GRAD = "hairGrad";

/* ─── component ─── */
export function AnimatedAvatar({ state }: AnimatedAvatarProps) {
  /* ---- blink ---- */
  const [blinkRatio, setBlinkRatio] = useState(1);

  useEffect(() => {
    if (state === "finished") {
      setBlinkRatio(0);
      return;
    }

    let blinkTimeout: number;

    const scheduleBlink = () => {
      const delay = 2500 + Math.random() * 3000;
      blinkTimeout = window.setTimeout(() => {
        setBlinkRatio(0);
        window.setTimeout(() => {
          setBlinkRatio(1);
          scheduleBlink();
        }, 150);
      }, delay);
    };

    scheduleBlink();
    return () => clearTimeout(blinkTimeout);
  }, [state]);

  /* ---- mouth animation (speaking) ---- */
  const [mouthOpen, setMouthOpen] = useState(0.2);
  const rafRef = useRef(0);
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (state !== "speaking") {
      setMouthOpen(state === "finished" ? 0 : 0.15);
      return;
    }

    startTimeRef.current = performance.now();

    const animate = (now: number) => {
      const elapsed = (now - startTimeRef.current) / 1000;
      const wave1 = Math.sin(elapsed * 8 * Math.PI * 2) * 0.35;
      const wave2 = Math.sin(elapsed * 13.7 * Math.PI * 2) * 0.2;
      const wave3 = Math.sin(elapsed * 5.3 * Math.PI * 2) * 0.2;
      const value = Math.max(0, Math.min(1, 0.15 + wave1 + wave2 + wave3));
      setMouthOpen(value);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state]);

  /* ---- eyebrows ---- */
  const eyebrow = (() => {
    switch (state) {
      case "listening":
        return "M21 25 Q27 22 33 25";
      case "finished":
        return "M21 28 Q27 29 33 28";
      default:
        return "M21 27 Q27 26 33 27";
    }
  })();

  /* ---- mouth ---- */
  const h = (() => {
    if (state === "finished") return 0;
    if (state === "speaking") return mouthOpen * 4;
    return 1;
  })();

  const mouthW = 9;
  const leftX = CX - mouthW / 2;
  const rightX = CX + mouthW / 2;

  let mouthEl: React.ReactNode;

  if (h < 0.8) {
    // Closed friendly smile
    const curve = 2.5;
    mouthEl = (
      <path
        d={`M${leftX} ${MOUTH_Y} Q${CX} ${MOUTH_Y + curve} ${rightX} ${MOUTH_Y}`}
        fill="none" stroke="#B34A4A" strokeWidth={1.5} strokeLinecap="round"
      />
    );
  } else {
    // Open mouth
    const gap = Math.min(h * 1.5, 5);
    mouthEl = (
      <ellipse cx={CX} cy={MOUTH_Y + gap / 2} rx={mouthW / 2} ry={gap / 2} fill="#2D0A0A" />
    );
  }

  /* ---- render ---- */
  return (
    <div className="animated-avatar-wrapper">
      <svg viewBox="0 0 72 72" width="100%" height="100%" role="img" aria-label="AI 面试官头像">
        <defs>
          {/* Warm skin gradient */}
          <radialGradient id={SKIN_GRAD} cx="38%" cy="30%" r="68%" fx="35%" fy="28%">
            <stop offset="0%" stopColor="#FFE4C4" />
            <stop offset="60%" stopColor="#FCD5B5" />
            <stop offset="100%" stopColor="#F0C09E" />
          </radialGradient>

          {/* Dark brown iris */}
          <radialGradient id={IRIS_GRAD} cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#6B4226" />
            <stop offset="60%" stopColor="#4A2E18" />
            <stop offset="100%" stopColor="#2D1A0A" />
          </radialGradient>

          {/* Hair — warm dark brown */}
          <linearGradient id={HAIR_GRAD} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6B4226" />
            <stop offset="50%" stopColor="#543318" />
            <stop offset="100%" stopColor="#3D2410" />
          </linearGradient>
        </defs>

        {/* ===== HAIR (behind) ===== */}
        <path
          d="M6 40 C6 8 66 8 66 40 C66 44 62 46 60 42 C58 20 14 20 12 42 C10 46 6 44 6 40 Z"
          fill={`url(#${HAIR_GRAD})`}
        />

        {/* Hair top volume — fluffy crown */}
        <path
          d="M14 34 C14 12 58 12 58 34 C58 16 14 16 14 34 Z"
          fill={`url(#${HAIR_GRAD})`}
        />

        {/* Side-swept bangs — main fringe */}
        <path
          d="M13 32 C13 14 44 10 56 18 C50 13 28 13 18 26 C15 30 14 33 13 32 Z"
          fill={`url(#${HAIR_GRAD})`}
        />

        {/* Bangs highlight */}
        <path
          d="M15 28 C15 14 40 12 48 17 C42 14 20 15 18 26 C17 28 16 29 15 28 Z"
          fill="#8B6840" opacity={0.35}
        />

        {/* Hair on sides — frames the face */}
        <path
          d="M10 34 C8 38 8 46 12 50 C10 44 10 38 12 34 Z"
          fill={`url(#${HAIR_GRAD})`}
        />
        <path
          d="M62 34 C64 38 64 46 60 50 C62 44 62 38 60 34 Z"
          fill={`url(#${HAIR_GRAD})`}
        />

        {/* Hair strand lines for texture */}
        <path d="M18 20 Q22 18 28 18" fill="none" stroke="#7A5535" strokeWidth={0.5} opacity={0.4} strokeLinecap="round" />
        <path d="M32 16 Q38 15 44 16" fill="none" stroke="#7A5535" strokeWidth={0.5} opacity={0.4} strokeLinecap="round" />
        <path d="M16 24 Q20 22 24 22" fill="none" stroke="#7A5535" strokeWidth={0.4} opacity={0.3} strokeLinecap="round" />

        {/* ===== EARS ===== */}
        <ellipse cx="14" cy={CY} rx="3" ry="4.5" fill={`url(#${SKIN_GRAD})`} />
        <ellipse cx="58" cy={CY} rx="3" ry="4.5" fill={`url(#${SKIN_GRAD})`} />

        {/* ===== HEAD ===== */}
        {/* Round, soft egg shape — Mii style */}
        <path
          d="M12 34 C12 14 22 10 36 10 C50 10 60 14 60 34 C60 48 54 58 42 62 C38 63 34 63 30 62 C18 58 12 48 12 34 Z"
          fill={`url(#${SKIN_GRAD})`}
        />

        {/* ===== CHEEK BLUSH ===== */}
        <ellipse cx="21" cy="38" rx="4" ry="2.5" fill="#FFB5B5" opacity={0.3} />
        <ellipse cx="51" cy="38" rx="4" ry="2.5" fill="#FFB5B5" opacity={0.3} />

        {/* ===== EYES ===== */}
        {([LEFT_EYE_X, RIGHT_EYE_X] as const).map((ex) => {
          const er = 4.2 * blinkRatio;

          return (
            <g key={ex}>
              {/* Eye white */}
              <ellipse cx={ex} cy={EYE_Y} rx={5} ry={5.5 * blinkRatio} fill="white" />

              {/* Iris */}
              <ellipse cx={ex} cy={EYE_Y} rx={3.5} ry={3.8 * blinkRatio} fill={`url(#${IRIS_GRAD})`} />

              {/* Pupil */}
              <ellipse cx={ex} cy={EYE_Y} rx={2} ry={2.2 * blinkRatio} fill="#111" />

              {/* Eye highlights (two sparkles) */}
              {blinkRatio > 0.3 && (
                <>
                  <circle cx={ex + 1.5} cy={EYE_Y - 1.5} r="1.2" fill="white" opacity={0.85} />
                  <circle cx={ex - 1} cy={EYE_Y + 1} r="0.5" fill="white" opacity={0.5} />
                </>
              )}

              {/* Upper eyelid */}
              <path
                d={`M${ex - 5.5} ${EYE_Y} Q${ex} ${EYE_Y - 5.5 * blinkRatio} ${ex + 5.5} ${EYE_Y}`}
                fill="none" stroke="#3A2418" strokeWidth={1.1} strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* ===== EYEBROWS ===== */}
        <path d={`${eyebrow}`} fill="none" stroke="#4A3020" strokeWidth={1.3} strokeLinecap="round" />
        <path d={`M${72 - 33} 25 Q${72 - 27} 22 ${72 - 21} 25`} fill="none" stroke="#4A3020" strokeWidth={1.3} strokeLinecap="round" />

        {/* ===== NOSE ===== */}
        <ellipse cx={CX} cy={NOSE_Y} rx="1.2" ry="1" fill="#E8BFA0" />

        {/* ===== MOUTH ===== */}
        {mouthEl}
      </svg>
    </div>
  );
}
