// Company logo — Clearbit fetch with serif initial fallback.
"use client";
import { useState } from "react";

interface Props {
  name: string;
  domain?: string | null;
  size?: number;
}

export function CompanyLogo({ name, domain, size = 64 }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const initial = name?.[0]?.toUpperCase() ?? "·";
  const showImage = !!domain && !errored;

  return (
    <div
      className="flex items-center justify-center flex-shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: showImage && loaded
          ? "var(--bg-elevated)"
          : "linear-gradient(155deg, oklch(0.32 0.07 18) 0%, oklch(0.22 0.05 18) 100%)",
        border: "1px solid var(--border-color)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://logo.clearbit.com/${domain}`}
          alt={`${name} logo`}
          width={size}
          height={size}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          style={{
            width: size,
            height: size,
            objectFit: "contain",
            opacity: loaded ? 1 : 0,
            transition: "opacity 200ms ease-out",
          }}
        />
      ) : (
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: size * 0.55,
            color: "oklch(0.9 0.05 18)",
          }}
        >
          {initial}
        </span>
      )}
    </div>
  );
}
