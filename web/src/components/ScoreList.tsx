import { DIMENSIONS, type Dimension, type Scores } from "../api";

export const DIMENSION_COPY: Record<Dimension, { label: string; hint: string }> = {
  readability: { label: "Readability", hint: "Can it be read and recognized quickly?" },
  originality: { label: "Originality", hint: "How far it stands apart from familiar marks." },
  balance: { label: "Balance", hint: "Distribution of visual weight and spacing." },
  scalability: { label: "Scalability", hint: "Holds up from favicon to billboard." },
  misinterpretation: { label: "Misreading safety", hint: "Higher means less likely to be misread." },
};

/** The five 1-10 scores with reasons, shared by Review, Advanced and Compare. */
export default function ScoreList({ scores, label = "Scores", hints = true }: { scores: Scores; label?: string; hints?: boolean }) {
  return (
    <ul className="scores" aria-label={label}>
      {DIMENSIONS.map((dim) => {
        const { score, reason } = scores[dim];
        return (
          <li key={dim} className="score" data-testid={`score-${dim}`}>
            <div className="score-top">
              <h3 className="score-label">{DIMENSION_COPY[dim].label}</h3>
              <span className="score-value">
                <span aria-hidden="true">
                  {score}
                  <span className="score-max">/10</span>
                </span>
                <span className="sr-only">{score} out of 10</span>
              </span>
            </div>
            <div className="meter" aria-hidden="true">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={i < score ? "tick on" : "tick"} />
              ))}
            </div>
            <p className="score-reason">{reason}</p>
            {hints && <p className="score-hint muted small">{DIMENSION_COPY[dim].hint}</p>}
          </li>
        );
      })}
    </ul>
  );
}
