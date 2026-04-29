// Shared confidence dot. Each section maps its own enum to a variant:
//   moat replicability:  high    → full     medium → partial  low → empty
//   traction metrics:    confirmed → full   estimated → partial  unknown → empty
//   market sizing:       analyst → full     company_stated → partial   our_estimate → partial
//                        unknown → caller should omit the dot entirely (no variant for "absent")
import React from "react";

export type ConfidenceVariant = "full" | "partial" | "empty";

export function confidenceDotStyles(variant: ConfidenceVariant): React.CSSProperties {
  if (variant === "full") {
    return {
      background: "var(--accent-color)",
      border: "1.5px solid var(--accent-color)",
    };
  }
  if (variant === "partial") {
    return {
      background: "var(--bg-elevated)",
      border: "1.5px solid var(--accent-color)",
    };
  }
  return {
    background: "transparent",
    border: "1.5px dashed var(--accent-color)",
  };
}

interface Props {
  variant: ConfidenceVariant;
  size?: number;
  title?: string;
}

export function ConfidenceDot({ variant, size = 9, title }: Props) {
  return (
    <span
      aria-hidden
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        display: "inline-block",
        transform: "translateY(-2px)",
        ...confidenceDotStyles(variant),
      }}
    />
  );
}
