import { consumeSearchBudget } from "./budget";
import { exaCompanyLogo } from "./exa-client";
import type { SearchBudget, SearchUsage } from "./types";

export interface FindCompanyLogoInput {
  name: string;
  domain: string | null;
}

export interface FindCompanyLogoOptions {
  /**
   * EXA key, passed only when EXA is the configured provider. EXA is the one
   * backend that can return an actual logo image
   * (`contents.extras.imageLinks`); the generic `SearchProvider` interface
   * returns url/title/snippet, so routing the logo through it would discard the
   * image and leave nothing but a hostname the caller already had.
   */
  exaApiKey?: string | null;
  budget?: SearchBudget;
  usage?: SearchUsage;
}

// Labels, then a final label that must be alphabetic — which rejects a bare
// IPv4 literal. No real company domain is an IP address, and an IP here is the
// case that turns a stored logo into a blind GET at an internal host from every
// viewer's browser.
const HOSTNAME =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,63}$/;

/**
 * A domain's own favicon. Free: no network call, no search slot. Derivable
 * because the caller already knows the domain — which is exactly why searching
 * to rediscover it would be waste.
 */
function faviconFor(domain: string): string | null {
  const host = domain.trim().toLowerCase().replace(/^www\./, "");
  // Allowlist a bare hostname rather than blacklisting a couple of characters.
  // `domain` arrives from the request body, which only requires `z.string()`, and
  // the result is persisted to the shared companies.logo_url column and rendered
  // as an <img src> in other users' browsers. A blacklist of "/" and " " left the
  // authority attacker-chosen outright, and `?`/`#`/`@` handed over the rest of
  // the URL too — a stored beacon that leaks every later viewer's IP and
  // User-Agent to a host of the attacker's choosing.
  if (!HOSTNAME.test(host) || host.length > 253) return null;
  // `.localhost` is special-use (RFC 6761): browsers resolve it to loopback, so
  // `beacon.localhost` clears every syntax check above and still turns a stored
  // logo into a GET against the *viewer's* own machine. Bare `localhost` is
  // already rejected by HOSTNAME (no dot); the subdomain form is not.
  if (host === "localhost" || host.endsWith(".localhost")) return null;
  return `https://${host}/favicon.ico`;
}

/**
 * Best-effort company logo. Never throws — a missing logo is fine, the UI falls
 * back to Clearbit and then to a serif initial.
 *
 * Two paths, deliberately asymmetric:
 *
 *   EXA configured — use EXA's own logo lookup, which returns a real image. One
 *   API call, debited against the search budget and counted in usage. That
 *   accounting is what the original path skipped.
 *
 *   Anything else — derive the domain's favicon locally. No network, no search
 *   slot. This is what fixes the actual defect: a Firecrawl or Tavily user
 *   previously got no logo at all, because the lookup was hardcoded to EXA.
 *
 * What this deliberately does NOT do is spend a paid search to find a favicon.
 * An earlier attempt searched `"<name> official site logo"`, restricted results
 * to the company's own domain, then took that domain's favicon — spending one
 * search (and, because a single-domain search almost always returns fewer than
 * SOURCE_FALLBACK_THRESHOLD results, usually a second fallback search too) to
 * recover a string it was handed as an argument, while losing the real logo
 * image for EXA users in the process.
 */
export async function findCompanyLogo(
  input: FindCompanyLogoInput,
  opts: FindCompanyLogoOptions = {},
): Promise<string | null> {
  if (opts.exaApiKey) {
    try {
      // Only debit a budget the caller actually owns. Manufacturing one here
      // would be theatre: a fresh 8-slot budget can never be exhausted, and its
      // counters are discarded on return, so the accounting would look real and
      // measure nothing. Today's only caller (company insert) has no
      // request-scoped budget to give, so the logo call is genuinely untracked —
      // recorded in tasks/todo.md rather than papered over here.
      if (opts.budget) consumeSearchBudget("exa", opts.budget);
      const logo = await exaCompanyLogo(input, opts.exaApiKey);
      if (opts.usage) opts.usage.calls++;
      if (logo) return logo;
    } catch {
      // Budget exhausted or EXA unreachable. Fall through to the free path
      // rather than returning nothing.
    }
  }

  return input.domain ? faviconFor(input.domain) : null;
}
