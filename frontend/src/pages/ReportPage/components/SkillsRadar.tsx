import { memo } from "react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from "recharts";

import type { SpeechSummary } from "@/interviewFlow";
import { classifySpeechLevel, speechPercent } from "../helpers/scoring";

export interface RadarDataPoint {
  subject: string;
  value: number;
  fullMark: number;
}

interface SkillsRadarProps {
  radarData: RadarDataPoint[];
  topSkills: RadarDataPoint[];
  speechSummary: SpeechSummary | null | undefined;
}

export const SkillsRadar = memo(function SkillsRadar({ radarData, topSkills, speechSummary }: SkillsRadarProps) {
  const hasData = radarData.length > 0;

  return (
    <div className="glass-card skills-card">
      <h3>软技能分析</h3>
      <div className="skills-content">
        <div className="radar-chart" role="img" aria-label={hasData ? `技能雷达图: ${radarData.map(d => `${d.subject} ${d.value}分`).join("、")}` : "暂无技能数据"}>
          {hasData ? (
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="#e6e8ea" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fill: "#00629d", fontSize: 12, fontWeight: 500 }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tick={{ fill: "#6f7883", fontSize: 10 }}
                  tickCount={4}
                />
                <Radar
                  name="能力值"
                  dataKey="value"
                  stroke="#1677ff"
                  fill="#1677ff"
                  fillOpacity={0.3}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="radar-empty">暂无回答数据</div>
          )}
        </div>
        <div className="skill-bars">
          {topSkills.map((s) => (
            <SkillBar key={s.subject} label={s.subject} percent={s.value} />
          ))}
        </div>
      </div>

      {/* 语音观察可视化 */}
      {speechSummary && speechSummary.chunkCount > 0 && (
        <div className="speech-metrics">
          <h4 className="speech-metrics-title">语音观察信号</h4>
          <div className="speech-metrics-grid">
            <SpeechMetricCard
              label="语速"
              value={speechSummary.speechRateSps > 0 ? `${Math.round(speechSummary.speechRateSps * 60)} 字/分钟` : "--"}
              level={speechSummary.speechRateSps > 0 ? classifySpeechLevel(speechSummary.speechRateSps * 60, 120, 160) : "--"}
              percent={speechSummary.speechRateSps > 0 ? speechPercent(speechSummary.speechRateSps * 60, 60, 200) : 0}
            />
            <SpeechMetricCard
              label="音量"
              value={speechSummary.rmsDbMean != null ? `${Math.round(speechSummary.rmsDbMean)} dBFS` : "--"}
              level={speechSummary.rmsDbMean != null ? classifySpeechLevel(speechSummary.rmsDbMean, -35, -10) : "--"}
              percent={speechSummary.rmsDbMean != null ? speechPercent(speechSummary.rmsDbMean, -50, 0) : 0}
            />
            <SpeechMetricCard
              label="语调起伏"
              value={speechSummary.f0StdSemitones != null ? `${speechSummary.f0StdSemitones.toFixed(1)} st` : "--"}
              level={speechSummary.f0StdSemitones != null ? classifySpeechLevel(speechSummary.f0StdSemitones, 1.5, 4.0) : "--"}
              percent={speechSummary.f0StdSemitones != null ? speechPercent(speechSummary.f0StdSemitones, 0, 8) : 0}
            />
          </div>
          <p className="speech-metrics-footnote">
            语音指标仅作为观察信号，不直接推断能力。语速参考范围 120–160 字/分钟，音量参考 -35 ~ -10 dBFS，语调起伏参考 1.5–4.0 st。
          </p>
        </div>
      )}
    </div>
  );
});

// 技能条
function SkillBar({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="skill-bar">
      <div className="skill-bar-header">
        <span>{label}</span>
        <span className="skill-bar-percent">{percent}%</span>
      </div>
      <div className="skill-bar-track">
        <div className="skill-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

// 语音指标卡片
function SpeechMetricCard({ label, value, level, percent }: {
  label: string;
  value: string;
  level: "偏低" | "合理" | "偏高" | "--";
  percent: number;
}) {
  const levelClass = level === "合理" ? "ok" : level === "偏低" ? "low" : level === "偏高" ? "high" : "";
  return (
    <div className={`speech-metric-card ${levelClass}`}>
      <span className="speech-metric-label">{label}</span>
      <strong className="speech-metric-value">{value}</strong>
      <div className="speech-metric-bar-track">
        <div className="speech-metric-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className={`speech-metric-level ${levelClass}`}>{level === "--" ? "无数据" : level}</span>
    </div>
  );
}
