import { DIMENSIONS, type Dimension, type Scores } from "../api";
import { ScoreRing } from "./ui/Score";

export const DIMENSION_COPY: Record<Dimension, { label: string; hint: string }> = {
  readability: { label: "Readability", hint: "Can it be read and recognized quickly?" },
  originality: { label: "Originality", hint: "How far it stands apart from familiar marks." },
  balance: { label: "Balance", hint: "Distribution of visual weight and spacing." },
  scalability: { label: "Scalability", hint: "Holds up from favicon to billboard." },
  misinterpretation: { label: "Misreading safety", hint: "Higher means less likely to be misread." },
};

/** The five 1-10 scores with reasons, shared by Review, Advanced and Compare: one row per dimension in a card. */
export default function ScoreList({ scores, label = "Scores", hints = true }: { scores: Scores; label?: string; hints?: boolean }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card" aria-label={label}>
      {DIMENSIONS.map((dim) => {
        const { score, reason } = scores[dim];
        return (
          <li
            key={dim}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-2 p-4 sm:p-5 md:grid-cols-[auto_13rem_minmax(0,1fr)] md:items-center md:gap-x-6"
            data-testid={`score-${dim}`}
          >
            <ScoreRing score={score} />
            <div className="min-w-0 self-center">
              <h3 className="text-sm font-semibold text-fg">{DIMENSION_COPY[dim].label}</h3>
              {hints && <p className="mt-0.5 text-xs leading-5 text-fg-subtle">{DIMENSION_COPY[dim].hint}</p>}
            </div>
            <p className="col-span-2 text-sm leading-6 text-fg-muted md:col-span-1">{reason}</p>
          </li>
        );
      })}
    </ul>
  );
}
