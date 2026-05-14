import { memo } from "react";

interface RatingCardProps {
  avgScore: number;
  ratingSummary: string;
}

export const RatingCard = memo(function RatingCard({ avgScore, ratingSummary }: RatingCardProps) {
  return (
    <div className="glass-card rating-card">
      <h3>AI 综合评分</h3>
      <div className="rating-score" role="status" aria-label={`综合评分 ${avgScore.toFixed(1)} 分，满分 5.0`}>
        <span className="score-value" aria-hidden="true">{avgScore.toFixed(1)}</span>
      </div>
      <div className="score-label">满分 5.0</div>
      <p className="rating-summary">{ratingSummary}</p>
    </div>
  );
});
