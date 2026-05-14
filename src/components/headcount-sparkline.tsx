// Compact headcount trajectory. Used in traction when ≥3 history entries.
"use client";

import React from "react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Dot,
} from "recharts";

export interface SparkPoint {
  date: string;
  count: number;
}

interface Props {
  data: SparkPoint[];
  height?: number;
}

const ACCENT = "var(--accent-color)";
const TEXT_FAINT = "var(--text-faint)";

interface DotProps {
  cx?: number;
  cy?: number;
  index?: number;
  isLast?: boolean;
}

function EndpointDot({ cx, cy, isLast }: DotProps) {
  if (cx == null || cy == null) return null;
  if (!isLast) return <Dot cx={cx} cy={cy} r={2} fill={ACCENT} />;
  return (
    <g>
      <circle cx={cx} cy={cy} r={4} fill={ACCENT} />
      <circle cx={cx} cy={cy} r={7} fill="none" stroke={ACCENT} strokeOpacity={0.3} />
    </g>
  );
}

export function HeadcountSparkline({ data, height = 80 }: Props) {
  const last = data.length - 1;
  return (
    <div style={{ width: "100%", height, minWidth: 0 }}>
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 400, height }}
      >
        <LineChart data={data} margin={{ top: 10, right: 36, bottom: 22, left: 0 }}>
          <XAxis
            dataKey="date"
            tick={{
              fill: TEXT_FAINT,
              fontSize: 10,
              fontFamily: "var(--font-sans)",
              letterSpacing: "0.06em",
            }}
            tickLine={false}
            axisLine={{ stroke: "var(--border-faint)" }}
            interval={0}
            tickFormatter={(v: string) => {
              const m = v.match(/^(\d{4})/);
              return m ? m[1] : v;
            }}
          />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line
            type="monotone"
            dataKey="count"
            stroke={ACCENT}
            strokeWidth={1.5}
            isAnimationActive={false}
            dot={(props: DotProps) => (
              <EndpointDot
                key={`pt-${props.index}`}
                {...props}
                isLast={props.index === last}
              />
            )}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
