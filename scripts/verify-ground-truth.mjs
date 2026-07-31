#!/usr/bin/env node
/**
 * Audits evals/ground-truth.ts by fetching every cited source and checking that
 * the page actually contains the value it is cited for.
 *
 * Why this exists: the ground-truth set is curated by an LLM reading the web,
 * and a curation pass once reported "tested every single fact against the exact
 * fetchable URL" while four facts were in fact inferred — a founding year cited
 * to a bare homepage, a country inferred from a pun in a tagline. An unsourced
 * value is indistinguishable from a guess by inspection, so the check has to be
 * mechanical.
 *
 * Deliberately NOT a vitest test: it needs network, and the unit suite must stay
 * runnable offline and free. Run it by hand after curating.
 *
 *   node scripts/verify-ground-truth.mjs [--json]
 *
 * Exit code is 1 when any fact is contradicted or unsupported, so CI could gate
 * on it if the network cost is ever judged acceptable.
 *
 * A FAIL means "this page does not visibly state this value" — not necessarily
 * "the value is wrong". Client-rendered pages and JSON-LD can hide a real fact
 * from a plain fetch, so treat FAIL as "a human must look", and UNVERIFIABLE as
 * "no text check is meaningful for this field".
 */
import { readFile } from "node:fs/promises";

const ROOT = new URL("..", import.meta.url);
// Optional path argument so a curation branch can be audited before it is
// merged, which is the only moment the audit can still change the outcome.
const explicit = process.argv.slice(2).find((a) => !a.startsWith("--"));
const SOURCE = explicit
  ? new URL(explicit, `file://${process.cwd()}/`)
  : new URL("evals/ground-truth.ts", ROOT);

/** ISO-3166 alpha-2 → strings a page might use instead of the code. */
const COUNTRY_ALIASES = {
  US: ["United States", "USA", "U.S.", "America"],
  GB: ["United Kingdom", "England", "London", "UK"],
  JP: ["Japan", "Japanese", "Tokyo"],
  CA: ["Canada", "Canadian", "Ottawa", "Toronto"],
  SE: ["Sweden", "Swedish", "Stockholm"],
  DE: ["Germany", "German", "Berlin"],
  FR: ["France", "French", "Paris"],
};

/**
 * Parses the fact records out of the source text rather than importing it, so
 * the audit needs no TypeScript toolchain and cannot be fooled by a module that
 * computes its values at import time.
 */
function parseFacts(text) {
  const facts = [];
  const domainRe = /^\s{2}"([^"]+)":\s*\{$/;
  const fieldRe = /^\s{4}(\w+):\s*\{$/;
  const scalarRe = /^\s{6}value:\s*(.+?),?$/;
  const sourceRe = /^\s{6}source:\s*"([^"]+)"/;
  const tierRe = /^\s{6}tier:\s*"([^"]+)"/;

  let domain = null;
  let field = null;
  let current = null;
  let objectDepth = 0;

  for (const line of text.split("\n")) {
    const d = line.match(domainRe);
    if (d) {
      domain = d[1];
      continue;
    }
    const f = line.match(fieldRe);
    if (f && domain) {
      field = f[1];
      current = { domain, field, value: null, source: null, tier: null };
      facts.push(current);
      continue;
    }
    if (!current) continue;

    // A nested `value: { ... }` (funding, employees, ticker) spans lines; collect
    // the raw inner text so the matchers can look for stage strings and amounts.
    if (/^\s{6}value:\s*\{$/.test(line)) {
      objectDepth = 1;
      current.value = "";
      continue;
    }
    if (objectDepth > 0) {
      if (/^\s{6}\},?$/.test(line)) {
        objectDepth = 0;
      } else {
        current.value += line.trim() + " ";
      }
      continue;
    }
    const s = line.match(scalarRe);
    if (s && current.value === null) {
      current.value = s[1].replace(/,$/, "").replace(/^"|"$/g, "");
      continue;
    }
    const src = line.match(sourceRe);
    if (src) current.source = src[1];
    const t = line.match(tierRe);
    if (t) current.tier = t[1];
  }
  return facts.filter((f) => f.source);
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/** Renderings a $330,000,000 round might appear as in prose. */
function amountVariants(usd) {
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) return [];
  const millions = n / 1_000_000;
  const billions = n / 1_000_000_000;
  const out = [n.toLocaleString("en-US"), String(n)];
  if (Number.isInteger(millions)) {
    out.push(`$${millions}M`, `${millions} million`, `$${millions} million`);
  }
  if (billions >= 1) {
    const b = Number(billions.toFixed(1));
    out.push(`$${b}B`, `${b} billion`, `$${b} billion`);
  }
  return out;
}

function checkFact(fact, hay) {
  const has = (needle) => hay.includes(String(needle).toLowerCase());

  switch (fact.field) {
    case "foundedYear":
      return has(fact.value)
        ? { verdict: "PASS", detail: `page contains "${fact.value}"` }
        : { verdict: "FAIL", detail: `page never states ${fact.value}` };

    case "hqCountry": {
      const aliases = COUNTRY_ALIASES[fact.value] ?? [];
      const hit = [fact.value, ...aliases].find(has);
      return hit
        ? { verdict: "PASS", detail: `matched "${hit}"` }
        : {
            verdict: "FAIL",
            detail: `no mention of ${fact.value} or ${aliases.join("/") || "aliases"}`,
          };
    }

    case "latestFunding": {
      const stage = fact.value.match(/stage:\s*"([^"]+)"/)?.[1];
      const amount = fact.value.match(/amountUsd:\s*([\d_]+)/)?.[1]?.replace(/_/g, "");
      const stageOk = stage ? has(stage) : null;
      const amountOk = amount ? amountVariants(amount).some(has) : null;
      if (stageOk === false && amountOk === false) {
        return {
          verdict: "FAIL",
          detail: `neither stage "${stage}" nor amount ${amount} appears`,
        };
      }
      if (stageOk === false || amountOk === false) {
        return {
          verdict: "PARTIAL",
          detail: `stage=${stageOk ? "found" : "MISSING"} amount=${amountOk ? "found" : "MISSING"}`,
        };
      }
      return { verdict: "PASS", detail: `stage and amount both appear` };
    }

    case "ticker": {
      const symbol = fact.value.match(/symbol:\s*"([^"]+)"/)?.[1];
      return symbol && has(symbol)
        ? { verdict: "PASS", detail: `symbol ${symbol} appears` }
        : { verdict: "FAIL", detail: `symbol ${symbol} not on page` };
    }

    case "employees":
      // A headcount band is a judgement about a range; no substring test can
      // confirm it. Flagged rather than silently passed.
      return {
        verdict: "UNVERIFIABLE",
        detail: "headcount bands cannot be text-matched — verify by hand",
      };

    default:
      return { verdict: "UNVERIFIABLE", detail: `no matcher for ${fact.field}` };
  }
}

// Memoises the PROMISE, not the resolved body: several facts cite one page, and
// caching the body only dedupes while the loop is sequential.
const pages = new Map();
function fetchPage(url) {
  const existing = pages.get(url);
  if (existing) return existing;
  const pending = (async () => {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "founderscope-ground-truth-audit" },
        signal: AbortSignal.timeout(20_000),
      });
      return res.ok
        ? stripHtml(await res.text()).toLowerCase()
        : `__HTTP_${res.status}__`;
    } catch (error) {
      return `__FETCH_ERROR_${error.name}__`;
    }
  })();
  pages.set(url, pending);
  return pending;
}

const asJson = process.argv.includes("--json");
const raw = await readFile(SOURCE, "utf8");
const facts = parseFacts(raw);

// The parser matches exact indentation, so a reformat could silently make it
// find nothing — and "nothing found" must never read as "everything passed".
// An independent count of `source:` lines catches that class of breakage.
const sourceLines = (raw.match(/^\s+source:/gm) ?? []).length;
if (facts.length !== sourceLines) {
  console.error(
    `Parser found ${facts.length} facts but the file has ${sourceLines} source lines. ` +
      "The parser is out of step with the file's formatting — fix it before trusting this audit.",
  );
  process.exit(2);
}
if (facts.length === 0) {
  console.error(
    "No facts parsed from the ground-truth file. Refusing to report a pass: an " +
      "empty audit is indistinguishable from a broken one.",
  );
  process.exit(2);
}

const rows = await Promise.all(
  facts.map(async (fact) => {
    const page = await fetchPage(fact.source);
    const unreachable = page.startsWith("__");
    const { verdict, detail } = unreachable
      ? { verdict: "UNREACHABLE", detail: page.replace(/__/g, "") }
      : checkFact(fact, page);
    return { ...fact, verdict, detail };
  }),
);

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const width = Math.max(...rows.map((r) => `${r.domain} ${r.field}`.length));
  for (const r of rows) {
    const label = `${r.domain} ${r.field}`.padEnd(width);
    console.log(`${r.verdict.padEnd(13)} ${label}  ${r.detail}`);
  }
  const tally = rows.reduce((acc, r) => {
    acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    "\n" +
      Object.entries(tally)
        .map(([k, v]) => `${k}=${v}`)
        .join("  "),
  );
  console.log(
    "\nFAIL means the page does not visibly state the value. Client-rendered\n" +
      "pages and JSON-LD can hide a real fact from a plain fetch, so a FAIL is\n" +
      "a prompt to look by hand, not proof the value is wrong.",
  );
}

const bad = rows.filter(
  (r) => r.verdict === "FAIL" || r.verdict === "UNREACHABLE",
).length;
process.exit(bad > 0 ? 1 : 0);
