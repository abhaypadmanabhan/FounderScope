// FounderScope — Charts (custom SVG, editorial style)
// Recharts-style line/area without the dependency. Tabular numerics, restrained styling.

const { useState: uS, useRef: uR, useMemo: uM } = React;

function AreaChart({ data, height = 240, accent = "var(--accent)", yFormat = (v) => v, xKey = "m", yKey = "v",
                     annotations = [], onHover, hoverIdx, padded = true }) {
  // data: [{m: number|string, v: number}]
  const W = 1, H = 1; // we'll use viewBox
  const padL = padded ? 36 : 0;
  const padR = padded ? 8 : 0;
  const padT = 16;
  const padB = padded ? 28 : 0;
  const innerW = 800 - padL - padR;
  const innerH = height - padT - padB;

  const xs = data.map((d, i) => typeof d[xKey] === "number" ? d[xKey] : i);
  const ys = data.map(d => d[yKey]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = 0, yMax = Math.max(...ys) * 1.1 || 1;

  const x = (v) => padL + ((v - xMin) / (xMax - xMin || 1)) * innerW;
  const y = (v) => padT + innerH - ((v - yMin) / (yMax - yMin || 1)) * innerH;

  const path = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(xs[i])} ${y(d[yKey])}`).join(" ");
  const area = `${path} L ${x(xs[xs.length - 1])} ${padT + innerH} L ${x(xs[0])} ${padT + innerH} Z`;

  // y-axis ticks
  const yTicks = 4;
  const yT = Array.from({ length: yTicks + 1 }, (_, i) => yMin + (i * (yMax - yMin) / yTicks));

  return (
    <svg viewBox={`0 0 800 ${height}`} width="100%" height={height}
         style={{ display: "block", overflow: "visible" }}
         onMouseLeave={() => onHover && onHover(null)}>
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.18" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* y grid */}
      {yT.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={padL + innerW} y1={y(v)} y2={y(v)}
                stroke="var(--border-faint)" strokeDasharray={i === 0 ? "0" : "2 4"} />
          {padded && (
            <text x={padL - 8} y={y(v) + 3} textAnchor="end"
                  fontSize="10" fill="var(--text-faint)" fontFamily="var(--font-sans)">
              {yFormat(v)}
            </text>
          )}
        </g>
      ))}

      {/* area + line */}
      <path d={area} fill="url(#areaFill)" />
      <path d={path} fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* x labels (sparse) */}
      {padded && data.map((d, i) => {
        if (data.length > 8 && i % Math.ceil(data.length / 6) !== 0 && i !== data.length - 1) return null;
        const label = typeof d[xKey] === "string" ? d[xKey] : d.label;
        if (!label) return null;
        return (
          <text key={i} x={x(xs[i])} y={padT + innerH + 18} textAnchor="middle"
                fontSize="10" fill="var(--text-faint)" fontFamily="var(--font-sans)">
            {label}
          </text>
        );
      })}

      {/* annotations (funding rounds) */}
      {annotations.map((a, i) => {
        const cx = x(a.x), cy = y(a.y);
        const active = hoverIdx === i;
        return (
          <g key={i}
             onMouseEnter={() => onHover && onHover(i)}
             style={{ cursor: "pointer" }}>
            <line x1={cx} x2={cx} y1={padT} y2={cy}
                  stroke={active ? accent : "var(--border-strong)"}
                  strokeDasharray="2 3" strokeOpacity={active ? 0.6 : 0.4} />
            <circle cx={cx} cy={cy} r={active ? 6 : 4}
                    fill="var(--bg-elevated)" stroke={accent} strokeWidth="1.5" />
            <text x={cx} y={padT - 6} textAnchor="middle"
                  fontSize="10" fill={active ? accent : "var(--text-muted)"}
                  fontFamily="var(--font-sans)" fontWeight={active ? 600 : 500}>
              {a.label}
            </text>
            {/* big invisible hit area */}
            <rect x={cx - 18} y={padT - 12} width="36" height={innerH + 18} fill="transparent" />
          </g>
        );
      })}

      {/* end-of-line value */}
      <g>
        <circle cx={x(xs[xs.length - 1])} cy={y(ys[ys.length - 1])} r="3" fill={accent} />
      </g>
    </svg>
  );
}

function LineChart({ data, height = 200, accent = "var(--accent)", yFormat = v => v, label }) {
  // simpler — used for traction
  const padL = 36, padR = 8, padT = 12, padB = 24;
  const innerW = 800 - padL - padR;
  const innerH = height - padT - padB;
  const ys = data.map(d => d.v);
  const yMax = Math.max(...ys) * 1.1 || 1;
  const x = (i) => padL + (i / (data.length - 1 || 1)) * innerW;
  const y = (v) => padT + innerH - (v / yMax) * innerH;
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.v)}`).join(" ");
  const area = `${path} L ${x(data.length - 1)} ${padT + innerH} L ${x(0)} ${padT + innerH} Z`;

  const yTicks = 3;
  const yT = Array.from({ length: yTicks + 1 }, (_, i) => i * yMax / yTicks);

  const [hover, setHover] = uS(null);

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 800 ${height}`} width="100%" height={height} style={{ display: "block", overflow: "visible" }}
           onMouseMove={(e) => {
             const rect = e.currentTarget.getBoundingClientRect();
             const px = ((e.clientX - rect.left) / rect.width) * 800;
             const i = Math.round(((px - padL) / innerW) * (data.length - 1));
             if (i >= 0 && i < data.length) setHover(i);
           }}
           onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`fill-${label}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.16" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {yT.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={padL + innerW} y1={y(v)} y2={y(v)}
                  stroke="var(--border-faint)" strokeDasharray={i === 0 ? "0" : "2 4"} />
            <text x={padL - 8} y={y(v) + 3} textAnchor="end"
                  fontSize="10" fill="var(--text-faint)" fontFamily="var(--font-sans)">
              {yFormat(v)}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#fill-${label})`} />
        <path d={path} fill="none" stroke={accent} strokeWidth="1.5" />
        {data.map((d, i) => (
          (i % Math.max(1, Math.ceil(data.length / 6)) === 0 || i === data.length - 1) && (
            <text key={i} x={x(i)} y={padT + innerH + 16} textAnchor="middle"
                  fontSize="10" fill="var(--text-faint)" fontFamily="var(--font-sans)">{d.m}</text>
          )
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH}
                  stroke={accent} strokeOpacity="0.4" />
            <circle cx={x(hover)} cy={y(data[hover].v)} r="4" fill={accent} stroke="var(--bg-elevated)" strokeWidth="1.5" />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div style={{
          position: "absolute", top: 0, left: `${(x(hover) / 800) * 100}%`,
          transform: "translate(-50%, -100%)", pointerEvents: "none",
          background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
          borderRadius: 6, padding: "5px 9px", fontSize: 12, color: "var(--text)",
          whiteSpace: "nowrap", fontFamily: "var(--font-mono)",
          boxShadow: "var(--shadow-2)",
        }}>
          <span style={{ color: "var(--text-faint)" }}>{data[hover].m}</span>{" · "}
          <span style={{ fontWeight: 500 }}>{yFormat(data[hover].v)}</span>
        </div>
      )}
    </div>
  );
}

window.AreaChart = AreaChart;
window.LineChart = LineChart;
