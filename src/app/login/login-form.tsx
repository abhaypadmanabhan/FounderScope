"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Mail, Loader2 } from "lucide-react";
import { Logomark } from "@/components/logomark";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Props = {
  next: string;
  initialError?: string;
};

type Mode = "signin" | "signup";

type State =
  | { stage: "form"; error: string | null }
  | { stage: "sent"; email: string; mode: Mode };

const COPY: Record<Mode, {
  cardTitle: string;
  cardLead: string;
  googleLabel: string;
  emailLabel: string;
  submitLabel: string;
  switchPrompt: string;
  switchCta: string;
  sentTitle: string;
  sentBody: (email: string) => string;
}> = {
  signin: {
    cardTitle: "Welcome back",
    cardLead: "Sign in to pick up where you left off.",
    googleLabel: "Continue with Google",
    emailLabel: "Email",
    submitLabel: "Email me a sign-in link",
    switchPrompt: "New to FounderScope?",
    switchCta: "Create an account",
    sentTitle: "Check your inbox.",
    sentBody: () => "We sent a sign-in link to",
  },
  signup: {
    cardTitle: "Create your account",
    cardLead: "Start researching companies in seconds.",
    googleLabel: "Sign up with Google",
    emailLabel: "Email",
    submitLabel: "Email me a sign-up link",
    switchPrompt: "Already have an account?",
    switchCta: "Sign in",
    sentTitle: "Check your inbox.",
    sentBody: () => "We sent a sign-up link to",
  },
};

export function LoginForm({ next, initialError }: Props) {
  const [mode, setMode] = useState<Mode>("signin");
  const [state, setState] = useState<State>({
    stage: "form",
    error: initialError ? errorMessage(initialError) : null,
  });
  const [email, setEmail] = useState("");
  const [pendingGoogle, startGoogle] = useTransition();
  const [pendingMagic, startMagic] = useTransition();

  const callback = (path: string) =>
    `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback?next=${encodeURIComponent(path)}`;

  const handleGoogle = () => {
    startGoogle(async () => {
      const { error } = await supabaseBrowser().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback(next) },
      });
      if (error) {
        setState({ stage: "form", error: error.message });
      }
    });
  };

  const handleMagic = (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    startMagic(async () => {
      const { error } = await supabaseBrowser().auth.signInWithOtp({
        email: value,
        options: { emailRedirectTo: callback(next) },
      });
      if (error) {
        setState({ stage: "form", error: error.message });
        return;
      }
      setState({ stage: "sent", email: value, mode });
    });
  };

  return (
    <main
      className="relative min-h-screen w-full"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      {/* Decorative grain + corner ornament */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 600px at 12% -10%, rgba(179, 85, 74, 0.08), transparent 60%), radial-gradient(900px 500px at 110% 110%, rgba(179, 85, 74, 0.05), transparent 55%)",
        }}
      />

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1240px] grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        {/* ── Left column: editorial pitch ─────────────── */}
        <section className="flex flex-col justify-between px-8 pt-10 pb-8 lg:px-14 lg:pt-12 lg:pb-12">
          <div className="flex items-center gap-2.5">
            <Logomark size={22} />
            <span
              className="serif"
              style={{ fontSize: 18, letterSpacing: "-0.01em", color: "var(--text)" }}
            >
              FounderScope
            </span>
          </div>

          <div className="my-auto max-w-[520px] py-16 lg:py-24">
            <div
              className="eyebrow mb-6"
              style={{ color: "var(--accent-color)" }}
            >
              Sign in · v0.4
            </div>
            <h1
              className="mb-5 text-balance"
              style={{
                color: "var(--text)",
                fontFamily: "var(--font-serif)",
                fontWeight: 400,
                fontSize: 44,
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
              }}
            >
              Your private research
              <br />
              <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                workspace.
              </span>
            </h1>
            <p
              className="lead"
              style={{ color: "var(--text-muted)", fontSize: 17 }}
            >
              Sign in to keep your sidebar of researched companies, pick up
              where you left off, and bring your own keys without spilling them
              into a shared session.
            </p>
          </div>

          <div
            className="hidden lg:flex items-center gap-4 micro"
            style={{ color: "var(--text-quiet)" }}
          >
            <span style={{ letterSpacing: "0.18em", textTransform: "uppercase" }}>
              Open source
            </span>
            <span
              aria-hidden
              className="inline-block"
              style={{
                height: 1,
                width: 48,
                background: "var(--border-strong)",
              }}
            />
            <span>Built for founders</span>
          </div>
        </section>

        {/* ── Right column: card with auth providers ────────── */}
        <section className="flex items-center px-8 pb-12 lg:px-14 lg:py-12">
          <div className="w-full max-w-[420px] mx-auto">
            {state.stage === "form" ? (
              <>
                <ModeTabs mode={mode} onSelect={(m) => setMode(m)} />
                <FormCard
                  copy={COPY[mode]}
                  pendingGoogle={pendingGoogle}
                  pendingMagic={pendingMagic}
                  email={email}
                  setEmail={setEmail}
                  onGoogle={handleGoogle}
                  onMagic={handleMagic}
                  error={state.error}
                  onSwitchMode={() =>
                    setMode(mode === "signin" ? "signup" : "signin")
                  }
                />
              </>
            ) : (
              <SentCard
                copy={COPY[state.mode]}
                email={state.email}
                onReset={() => {
                  setEmail("");
                  setState({ stage: "form", error: null });
                }}
              />
            )}

            <p
              className="micro mt-6 text-center"
              style={{ color: "var(--text-quiet)" }}
            >
              By continuing you agree to keep your API keys local. We never
              transmit your keys to our servers.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function ModeTabs({
  mode,
  onSelect,
}: {
  mode: Mode;
  onSelect: (m: Mode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Choose sign in or sign up"
      className="mb-4 flex p-1 rounded-[var(--radius-md)]"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-color)",
      }}
    >
      {(["signin", "signup"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(m)}
            className="t-200 flex-1 cursor-pointer rounded-[calc(var(--radius-md)-2px)] py-2"
            style={{
              background: active ? "var(--accent-color)" : "transparent",
              color: active ? "var(--accent-fg)" : "var(--text-muted)",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "-0.005em",
              border: "none",
            }}
          >
            {m === "signin" ? "Sign in" : "Sign up"}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

type Copy = typeof COPY[Mode];

type FormCardProps = {
  copy: Copy;
  pendingGoogle: boolean;
  pendingMagic: boolean;
  email: string;
  setEmail: (v: string) => void;
  onGoogle: () => void;
  onMagic: (e: React.FormEvent) => void;
  onSwitchMode: () => void;
  error: string | null;
};

function FormCard({
  copy,
  pendingGoogle,
  pendingMagic,
  email,
  setEmail,
  onGoogle,
  onMagic,
  onSwitchMode,
  error,
}: FormCardProps) {
  return (
    <div
      className="fade-in rounded-[var(--radius-lg)] p-8"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-strong)",
        boxShadow: "var(--shadow-pop)",
      }}
    >
      <h2
        className="mb-1"
        style={{
          color: "var(--text)",
          fontFamily: "var(--font-serif)",
          fontWeight: 500,
          fontSize: 20,
          lineHeight: 1.3,
          letterSpacing: "-0.01em",
        }}
      >
        {copy.cardTitle}
      </h2>
      <p className="small mb-6" style={{ color: "var(--text-muted)" }}>
        {copy.cardLead}
      </p>

      {error ? (
        <div
          role="alert"
          className="mb-5 px-3 py-2.5 rounded-[var(--radius-md)] small"
          style={{
            background: "rgba(143, 61, 51, 0.10)",
            border: "1px solid rgba(143, 61, 51, 0.30)",
            color: "var(--accent-color)",
          }}
        >
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onGoogle}
        disabled={pendingGoogle || pendingMagic}
        className="t-200 w-full flex items-center justify-center gap-2.5 h-11 rounded-[var(--radius-md)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          background: "var(--text)",
          color: "var(--bg)",
          fontFamily: "var(--font-sans)",
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: "-0.005em",
        }}
        onMouseEnter={(e) => {
          if (pendingGoogle || pendingMagic) return;
          e.currentTarget.style.background = "var(--text-muted)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--text)";
        }}
      >
        {pendingGoogle ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <GoogleGlyph />
        )}
        <span>{copy.googleLabel}</span>
      </button>

      <div
        className="flex items-center gap-3 my-6"
        aria-hidden
      >
        <span
          className="flex-1"
          style={{ height: 1, background: "var(--border-color)" }}
        />
        <span
          className="eyebrow"
          style={{ color: "var(--text-quiet)", fontSize: 10 }}
        >
          or
        </span>
        <span
          className="flex-1"
          style={{ height: 1, background: "var(--border-color)" }}
        />
      </div>

      <form onSubmit={onMagic} className="flex flex-col gap-2.5">
        <label
          className="eyebrow"
          htmlFor="email"
          style={{ color: "var(--text-faint)", fontSize: 10 }}
        >
          {copy.emailLabel}
        </label>
        <div
          className="flex items-center gap-2 px-3 rounded-[var(--radius-md)] t-200"
          style={{
            height: 44,
            background: "var(--bg)",
            border: "1px solid var(--border-strong)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-border)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border-strong)";
          }}
        >
          <Mail size={15} style={{ color: "var(--text-faint)" }} />
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            disabled={pendingMagic || pendingGoogle}
            className="w-full bg-transparent outline-none"
            style={{
              color: "var(--text)",
              fontSize: 14,
              fontFamily: "var(--font-sans)",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={pendingMagic || pendingGoogle || !email.trim()}
          className="t-200 mt-2 w-full flex items-center justify-center gap-2 h-11 rounded-[var(--radius-md)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "var(--accent-color)",
            color: "var(--accent-fg)",
            fontFamily: "var(--font-sans)",
            fontSize: 14,
            fontWeight: 500,
            letterSpacing: "-0.005em",
            border: "1px solid var(--accent-color)",
          }}
          onMouseEnter={(e) => {
            if (pendingMagic || pendingGoogle || !email.trim()) return;
            e.currentTarget.style.background = "var(--accent-hover)";
            e.currentTarget.style.borderColor = "var(--accent-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--accent-color)";
            e.currentTarget.style.borderColor = "var(--accent-color)";
          }}
        >
          {pendingMagic ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              <span>{copy.submitLabel}</span>
              <ArrowRight size={15} />
            </>
          )}
        </button>
      </form>

      <p
        className="small mt-6 text-center"
        style={{ color: "var(--text-muted)" }}
      >
        {copy.switchPrompt}{" "}
        <button
          type="button"
          onClick={onSwitchMode}
          className="t-200 cursor-pointer"
          style={{
            color: "var(--accent-color)",
            fontWeight: 500,
            background: "transparent",
            border: "none",
          }}
        >
          {copy.switchCta}
        </button>
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function SentCard({
  copy,
  email,
  onReset,
}: {
  copy: Copy;
  email: string;
  onReset: () => void;
}) {
  return (
    <div
      className="fade-in rounded-[var(--radius-lg)] p-8"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-strong)",
        boxShadow: "var(--shadow-pop)",
      }}
    >
      <div
        className="inline-flex items-center justify-center mb-5"
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          background: "var(--accent-bg)",
          border: "1px solid var(--accent-border)",
        }}
      >
        <Mail size={18} style={{ color: "var(--accent-color)" }} />
      </div>
      <h2
        className="mb-2"
        style={{
          color: "var(--text)",
          fontFamily: "var(--font-serif)",
          fontWeight: 500,
          fontSize: 20,
          lineHeight: 1.3,
          letterSpacing: "-0.01em",
        }}
      >
        {copy.sentTitle}
      </h2>
      <p className="body-muted mb-1" style={{ fontSize: 14 }}>
        {copy.sentBody(email)}
      </p>
      <p
        className="serif mb-6"
        style={{
          color: "var(--text)",
          fontSize: 17,
          letterSpacing: "-0.005em",
        }}
      >
        {email}
      </p>
      <p className="small mb-6" style={{ color: "var(--text-muted)" }}>
        The link expires in one hour. If you don&rsquo;t see it, check spam, or
        request a new one.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="t-200 inline-flex items-center gap-1.5 cursor-pointer"
        style={{
          color: "var(--accent-color)",
          fontSize: 13,
          fontFamily: "var(--font-sans)",
          fontWeight: 500,
        }}
      >
        Use a different email
        <ArrowRight size={13} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function GoogleGlyph() {
  // Multi-color Google G. Inline SVG keeps the bundle clean.
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.05-3.72 1.05-2.86 0-5.29-1.93-6.15-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.85 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.35-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.67-2.83Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.45 2.1 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.67 2.83C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

function errorMessage(code: string): string {
  switch (code) {
    case "link_invalid":
      return "That magic link expired or was already used. Request a new one below.";
    case "oauth_cancelled":
      return "Google sign-in cancelled.";
    case "auth_error":
      return "Sign-in failed. Please try again.";
    default:
      return "Sign-in failed. Please try again.";
  }
}
