# Lessons

## Kimi sections all failed: `response_format` silently breaks Moonshot's tool channel

**Date:** 2026-06-18

**Symptom:** On the Kimi (Moonshot) provider, every research section failed; disambiguation
appeared to work but was silently falling back to raw input. Anthropic was fine.

**Investigation that mattered — a LIVE 3-condition probe** against `api.moonshot.ai/v1`
(offline unit tests could NOT have found this):

| Condition (tools always present) | finish_reason | tool_calls | outcome |
|---|---|---|---|
| strict `json_schema` response_format | `stop` | none | tool call serialized into `content` → broken |
| **no** response_format | `tool_calls` | 3 | native tool channel → works |
| `json_object` response_format | `stop` | none | also broken |

**Root cause:** kimi-k2.5 will not use the native `tool_calls` channel when ANY
`response_format` is set — it jams its intended tool call into the message `content` as a
JSON blob and returns `finish_reason: stop`. Our loop treated that as the final answer and
Zod-rejected it. Because every section exposes the EXA tool, forcing a response format
killed the research loop entirely. `disambiguateCompany` hit the same wall but swallows
errors (falls back to the raw name), which masked the failure as "working".

**The misdirection:** I first found that `z.toJSONSchema()` output wasn't MFJS-strict-
compliant (optional→not-required, `.default()`/`.catch()`→`default`, `.url()`→`format`) and
built a `toStrictJsonSchema()` transform. That was a REAL but INSUFFICIENT sub-problem — the
live test showed even a perfectly strict schema breaks tool use. I removed that code; the
correct fix is to send no `response_format` at all.

**Fix:** Kimi adapter sends `tools` and NO `response_format`. The schema is conveyed via the
prompt (`buildSectionPrompt` already embeds it) and the reply is validated by
`parseFinalOpenAI` (JSON.parse → extractJson fallback → Zod + salvage). This mirrors the
Anthropic adapter, which never used a strict response format either.

**Rules for next time:**
- A design spec's "smoke test" acceptance criterion is load-bearing. This combo
  (strict structured output + multi-turn tool loop) was specced but the live smoke test was
  never run, so a config that cannot work shipped. Run the live test before believing it.
- When two providers share schemas but one enforces structured output + tools, VERIFY that
  pairing live — provider docs imply OpenAI-parity that may not hold (OpenAI applies
  response_format only to the final turn; Moonshot applies it to tool-call turns too).
- Offline tests prove schema shape; only a live call proves the model's *channel* behavior.
- A provider that "works" via a silent fallback (disambiguate) is not evidence the path works.
