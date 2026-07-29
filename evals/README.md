# FounderScope research evals

Evalite-based harness for benchmarking model swaps on the 7-section company
research pipeline. **Not for CI.**

## Cost warning

`npm run eval` hits **live OpenRouter and search APIs** and costs **real money**
(~$0.14/research at the approved model map, more at legacy pricing). Never run
this in CI or unattended automation. Use `MOCK_RESEARCH=true` only for frontend
dev — it does not apply to evals.

## Layout

| Path | Purpose |
|---|---|
| `golden-set.ts` | 20 companies: 10 early-stage + 10 enterprise |
| `domains.ts` | Per-section domain allowlists (spec D5) |
| `scorers/` | Four deterministic, free scorers (no LLM judges) |
| `research.eval.ts` | Evalite runner entries (task wiring pending B1) |
| `../evalite.config.ts` | Runner timeouts/concurrency (project root) |

## Scorers

| Scorer | Signal |
|---|---|
| `schema-pass` | Zod validation succeeded per section |
| `citation-fill-rate` | `cited_claims / total_claims` |
| `dead-link-rate` | Fraction of citations with `status: dead` (inverted in Evalite score) |
| `domain-adherence` | Citations inside the section maturity allowlist |

## Running

```bash
# Requires OPENROUTER + search keys once B1 wires the task. DO NOT run in CI.
npm run eval
```

Unit tests for scorers (no API calls): `npm test -- __tests__/evals-scorers-deterministic.test.ts`

## Status

Phase A scaffold only. The eval `task` throws until phase B1 lands the OpenRouter
LLM layer. Scorers are unit-tested against fixtures in `evals/fixtures/`.
