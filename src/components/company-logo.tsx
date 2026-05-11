// Company logo — prefer stored EXA URL, fall back to Clearbit, then serif initial.
"use client";
import { useState } from "react";

interface Props {
  name: string;
  domain?: string | null;
  logoUrl?: string | null;
  size?: number;
}

type Step = "primary" | "clearbit" | "initial";

function initialStep(logoUrl: string | null | undefined, domain: string | null | undefined): Step {
  if (logoUrl) return "primary";
  if (domain) return "clearbit";
  return "initial";
}

export function CompanyLogo({ name, domain, logoUrl, size = 64 }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState<Step>(() => initialStep(logoUrl, domain));
  const initial = name?.[0]?.toUpperCase() ?? "·";

  const src =
    step === "primary"
      ? (logoUrl as string)
      : step === "clearbit"
        ? `https://logo.clearbit.com/${domain}`
        : null;

  const onError = () => {
    setLoaded(false);
    if (step === "primary") {
      setStep(domain ? "clearbit" : "initial");
    } else if (step === "clearbit") {
      setStep("initial");
    }
  };

  return (
    <div
      className="flex items-center justify-center flex-shrink-0 overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: src && loaded
          ? "var(--bg-elevated)"
          : "linear-gradient(155deg, oklch(0.32 0.07 18) 0%, oklch(0.22 0.05 18) 100%)",
        border: "1px solid var(--border-color)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`${name} logo`}
          width={size}
          height={size}
          onLoad={() => setLoaded(true)}
          onError={onError}
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
