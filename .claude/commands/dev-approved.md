---
description: Promote verified dev work toward release — open/refresh the dev→main PR, run security + simplification review, apply release gates, prepare and verify release artifacts, update release docs. Never merges to main on its own.
argument-hint: "[optional: version bump, e.g. 0.1.1 or 'minor']"
---

# /dev-approved — promote dev toward release (generic, agent-agnostic)

Manual testing passed. Prepare a shippable release candidate. **Do NOT merge to `main`**
unless the user explicitly instructs it. Version arg: `$ARGUMENTS`

## Step 0 — Discover project context

Read `CLAUDE.md` / `AGENTS.md`: real build/test/release commands, version file location,
signing setup. They OVERRIDE anything generic below.

## Step 1 — Confirm dev is clean & fully tested

`git checkout dev`; working tree must be clean; run the FULL build + test suite
(and `.claude/gates/run-all.sh release` if the project has gates). Abort on any red —
send the user back to `/agents-done` or `/dev-reject`.

## Step 2 — PR dev → main

If `gh` is authenticated: `gh pr view dev || gh pr create --base main --head dev
--title "Release candidate: dev → main (<version>)" --body-file <today's brief>`.
Otherwise write the PR body to `tasks/reports/release-<date>.md` and tell the user to
open it manually. Report PR URL/state.

## Step 3 — Security review

Review the `main...dev` diff for security issues (`/security-review` skill if available,
otherwise manual: secrets, injection, authz, unsafe deserialization, dependency risk).
Triage EVERY finding: fix in a focused commit on `dev`, or record an explicit
accepted-risk note in the release doc. Never skip before release.

## Step 4 — Simplify pass

Where merged patches are overcomplicated, apply safe simplifications (quality only, not a
bug hunt); re-run build + tests after.

## Step 5 — Release checklist (strict)

- Full gates/tests green with strict settings.
- No new unvetted dependencies.
- Release notes / CHANGELOG updated.
- No secrets in `main...dev` diff.
- Version bumped where the project stores it, if `$ARGUMENTS` requests it.

## Step 6 — Release artifact

Build the release-configuration artifact with the project's real release command
(archive / production build / package). If signing/notarization/deploy credentials are
NOT configured, STOP at that point and report exactly what's missing — document the
artifact as a test artifact, not a distributable. Never deploy to prod or publish
without explicit user instruction.

## Step 7 — Release documentation

Update or create: CHANGELOG, known issues, manual-QA-completed record (link the
`/agents-done` checklist run), rollback instructions (`git revert -m 1 <merge-sha>` per
package). Keep the brief linked as the audit trail.

## Step 8 — Do not merge to main

Leave the PR open for the user's final approval. If explicitly instructed to merge:
`git checkout main && git merge --no-ff dev`, tag `v<version>`, report — never on your
own initiative.

## Output

1. PR link/status. 2. Security review status + triage. 3. Simplifications applied.
4. Release checklist results. 5. Artifact path + signing status. 6. Docs updated.
7. Remaining manual steps before shipping.
