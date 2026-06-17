// Giant serif aggregate replicability score. One accent (amber): severity is
// carried by the mono label + the radar, never by a traffic-light color.
// Low score = easy to rebuild = "go". High = walk away.
import React from "react";

const LABELS = [
  "easy to rebuild",
  "achievable",
  "narrowing window",
  "uphill battle",
  "walk away",
] as const;

function labelForScore(score: number): string {
  const idx = Math.min(4, Math.max(0, Math.floor((score - 1) / 2)));
  return LABELS[idx];
}

interface Props {
  score: number;          // 1-10, may be fractional
  moatTypePhrase?: string; // e.g. "Data + Brand + Regulatory"
}

export function ReplicabilityScore({ score, moatTypePhrase }: Props) {
  const label = labelForScore(score);
  const display = score.toFixed(1);

  return (
    <div className="flex flex-col items-start gap-2.5">
      <div className="flex items-baseline gap-1.5">
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 400,
            fontSize: 84,
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
            color: "var(--accent-color)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {display}
        </span>
        <span
          className="font-mono"
          style={{
            fontSize: 18,
            color: "var(--text-quiet)",
            letterSpacing: "-0.02em",
          }}
        >
          /10
        </span>
      </div>

      <span
        className="font-mono"
        style={{
          fontSize: 11,
          color: "var(--text-soft)",
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          fontWeight: 500,
        }}
      >
        {label}
      </span>

      {moatTypePhrase && (
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontStyle: "italic",
            fontSize: 15,
            color: "var(--text-muted)",
            lineHeight: 1.4,
            marginTop: 2,
          }}
        >
          {moatTypePhrase}
        </span>
      )}
    </div>
  );
}
