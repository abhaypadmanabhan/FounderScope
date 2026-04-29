// Per-axis replicability visualization with confidence-styled dots.
// Confidence = how sure we are. High = filled dot. Medium = half-fill. Low = hollow + dashed stroke.
"use client";

import React from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

type Confidence = "high" | "medium" | "low";

export interface RadarAxis {
  axis: string;          // display label
  score: number;         // 1-10
  confidence: Confidence;
}

interface Props {
  axes: RadarAxis[];
  height?: number;
}

const ACCENT = "var(--accent-color)";
const ACCENT_BG = "var(--accent-bg)";
const BG_ELEVATED = "var(--bg-elevated)";

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: RadarAxis;
}

// Custom dot — size + fill driven by confidence.
function ConfidenceDot({ cx, cy, payload }: DotProps) {
  if (cx == null || cy == null || !payload) return null;
  const { confidence } = payload;

  if (confidence === "high") {
    return <circle cx={cx} cy={cy} r={5} fill={ACCENT} />;
  }
  if (confidence === "medium") {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4.5}
        fill={BG_ELEVATED}
        stroke={ACCENT}
        strokeWidth={2}
      />
    );
  }
  // low
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="transparent"
      stroke={ACCENT}
      strokeWidth={1.5}
      strokeDasharray="2 2"
    />
  );
}

export function ReplicabilityRadar({ axes, height = 240 }: Props) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart
          data={axes}
          outerRadius="78%"
          margin={{ top: 12, right: 24, bottom: 12, left: 24 }}
        >
          <PolarGrid stroke="var(--border-faint)" gridType="polygon" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{
              fill: "var(--text-muted)",
              fontSize: 11,
              fontFamily: "var(--font-sans)",
              letterSpacing: "0.08em",
            }}
            tickFormatter={(v: string) => v.toUpperCase()}
          />
          <PolarRadiusAxis
            domain={[0, 10]}
            axisLine={false}
            tick={false}
          />
          <Radar
            name="replicability"
            dataKey="score"
            stroke={ACCENT}
            strokeWidth={1.5}
            fill={ACCENT}
            fillOpacity={0.14}
            dot={<ConfidenceDot />}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Re-exported for use in legend/tooltip-equivalents downstream.
export const __confidenceTokens__ = { ACCENT, ACCENT_BG, BG_ELEVATED };
