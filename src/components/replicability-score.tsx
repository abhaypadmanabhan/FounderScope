// Giant serif aggregate replicability score with founder-semantics color scale.
// High score = easy to rebuild = green (go). Low = walk away = red.
import React from "react";

const TOKENS = [
  "var(--rep-red)",
  "var(--rep-rust)",
  "var(--rep-amber)",
  "var(--rep-olive)",
  "var(--rep-green)",
] as const;

const LABELS = [
  "walk away",
  "uphill battle",
  "narrowing window",
  "achievable",
  "easy to rebuild",
] as const;

export function colorForScore(score: number): string {
  // 1-2 red, 3-4 rust, 5-6 amber, 7-8 olive, 9-10 green
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
