---
description: Handle failed manual testing safely — capture the failure, trace it to the responsible merge, keep dev off main, choose fix-forward or revert, update the audit trail, and emit a prompt for the fixing agent.
argument-hint: "[failure description, or leave blank to be asked]"
---

# /dev-reject — manual testing failed; recover safely (generic, agent-agnostic)

Contain the damage, find the root cause, set up a clean fix pass.
**Do NOT promote `dev` to `main`.** Failure details: `$ARGUMENTS`

## Step 0 — Discover project context

Read `CLAUDE.md` / `AGENTS.md` for build/test commands. Base branch = `dev` if present.
Today's brief lives in `tasks/patch-bibles/` or `tasks/briefs/`.

## Step 1 — Capture the failure

If `$ARGUMENTS` is empty, ask the user: what they did, expected vs actual, which
screen/flow, console output. Record verbatim in the brief and in
`tasks/reports/reject-<date>.md`.

## Step 2 — Trace to the responsible merge

- `git log --oneline --merges main..dev` — the per-package `--no-ff` merges.
- Map the failing area to a work package via the brief's scopes and
  `git diff --name-only main..dev` / `git log -p -S'<symbol>' main..dev`.
- If unclear: `git bisect` between `main` (last known good) and `dev`.
- **Reproduce first.** If you cannot reproduce, say so and mark low priority — never
  guess-fix. Never two blind fix attempts in a row; instrument the path with checkpoint
  logs before a second attempt.

## Step 3 — Keep dev off main

Confirm nothing was merged to `main`. Mark any open dev→main PR blocked/needs-fix.

## Step 4 — Fix plan (write into the brief + reject report)

Bug summary · suspected root cause · recommended owner/agent · files involved ·
acceptance criteria (MUST include a regression test that fails now) · tests needed.

## Step 5 — Contain: fix-forward OR revert (choose the safer)

- **Isolated to one package, dev otherwise healthy → fix-forward.**
  `git worktree add ../<project>-worktrees/$(date +%F)-fix-<slug> -b patch/$(date +%F)/fix-<slug> dev`
  (install the repo pre-commit hook into the worktree if one exists).
- **Merge broadly broken / entangled → revert it.**
  `git checkout dev && git revert -m 1 <bad-merge-sha>`, re-run full build+tests to prove
  `dev` is green, quarantine that branch for rework.

State the choice and why.

## Step 6 — Update the audit trail

Brief: rejection reason, decision, new branch or revert sha. Update any relay/state doc
the project keeps so the next session sees the true state.

## Step 7 — Emit the fixing-agent prompt

Same self-contained shape as `/morning-patch`: starts with
`cd <ABSOLUTE worktree path>` + "Work ONLY in this directory", then branch, brief pointer,
bug summary, scope in/out, the regression test to add, exact test command, commit-in-
worktree-only, no merge/push/PR, append completion note when done.

## Output

1. Rejection summary + repro status. 2. Root cause + responsible merge.
3. Fix vs revert decision. 4. New worktree or revert sha. 5. Fixing-agent prompt.
6. Next command after the fix lands: `/agents-done`.
