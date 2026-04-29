// Giant serif aggregate replicability score with founder-semantics color scale.
// Low score = easy to rebuild = green (go). High = walk away = red.
import React from "react";

const TOKENS = [
  "var(--rep-green)",
  "var(--rep-olive)",
  "var(--rep-amber)",
  "var(--rep-rust)",
  "var(--rep-red)",
] as const;

const LABELS = [
  "easy to rebuild",
  "achievable",
  "narrowing window",
  "uphill battle",
  "walk away",
] as const;

export function colorForScore(score: number): string {
  // 1-2 green, 3-4 olive, 5-6 amber, 7-8 rust, 9-10 red
  const idx = Math.min(4, Math.max(0, Math.floor((score - 1) / 2)));
  return TOKENS[idx];
}

export function labelForScore(score: number): string {
  const idx = Math.min(4, Math.max(0, Math.floor((score - 1) / 2)));
  return LABELS[idx];
}

interface Props {
  score: number;          // 1-10, may be fractional
  moatTypePhrase?: string; // e.g. "Data + Brand + Regulatory"
}

export function ReplicabilityScore({ score, moatTypePhrase }: Props) {
  const color = colorForScore(score);
  const label = labelForScore(score);
  const display = score.toFixed(1);

  return (
    <div className="flex flex-col items-start gap-2.5">
      <div className="flex items-baseline gap-2 num">
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontWeight: 400,
            fontSize: 84,
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
            color,
          }}
        >
          {display}
        </span>
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 22,
            color: "var(--text-quiet)",
            fontWeight: 400,
          }}
        >
          / 10
        </span>
      </div>

      <span
        className="micro"
        style={{
          color,
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
