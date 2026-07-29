---
description: Collect completed work from every agent worktree, verify it, merge accepted work into dev in safe order, run tests/gates, produce a testable build, and emit a manual QA checklist.
argument-hint: "[optional: specific worktree/branch to process]"
---

# /agents-done — collect, verify, merge into dev (generic, agent-agnostic)

You are the **integration owner**. Merge only what is safe; keep a clean audit trail.
Never merge broken, untested, or suspicious work. Never hide a failing test.
Optional scope: `$ARGUMENTS`

## Step 0 — Discover project context

Read `CLAUDE.md` / `AGENTS.md` for the real build/test commands and constraints — they
OVERRIDE anything generic below. Base branch = `dev` if it exists, else `main`.
Read today's brief (`tasks/patch-bibles/<date>.md` or `tasks/briefs/`) — it defines the
expected worktrees, scopes, merge order, acceptance criteria.

## Step 1 — Inspect every agent worktree

`git worktree list`. For each `patch/*` worktree: branch, commits ahead of base
(`git -C <wt> log --oneline <base>..HEAD`), changed files
(`git -C <wt> diff --name-only <base>...HEAD`), the completion note in the brief,
uncommitted changes, recorded test results.

## Step 2 — Quarantine gate (reject BEFORE merge)

Quarantine (do NOT merge; record why) any worktree with: broken build / failing tests;
secrets or credential files in the diff; large binary artifacts; out-of-scope or unrelated
changes; violations of contracts frozen in the brief; deleted or weakened tests; messy or
unsafe history. Use `.claude/gates/*` scripts if the project has them; otherwise check by
hand (`git diff` + `rg -i 'api[_-]?key|secret|token' <changed files>`). Leave quarantined
branches untouched for `/dev-reject` or a fix pass.

## Step 3 — Verify & merge accepted worktrees (brief's merge order)

Per package:
1. **Read the diff** (`git -C <wt> diff <base>...HEAD`) — review it, don't rubber-stamp.
2. **Run the project's test command** in the worktree (from Step 0) before merging.
3. **Merge with a no-ff merge** from the main checkout:
   `git checkout <base> && git merge --no-ff patch/<date>/<slug> -m "merge(patch/<date>/<slug>): <summary>"`.
   One merge per package → one-command revert later. Resolve conflicts deliberately;
   re-test after resolving.

## Step 4 — Integration verification on the base branch

After all merges: run the FULL build + test (real output, not claims). If broken →
identify the culprit merge, `git revert -m 1 <merge-sha>`, re-verify, move that package to
quarantine. Run a security pass on the merged diff (`/security-review` if available,
otherwise manual secret/injection scan). Update README/CHANGELOG/state docs the project keeps.

## Step 5 — Produce a testable build

Build a runnable artifact using the project's real build command (dev config). Report the
artifact path/URL and how to launch it.

## Step 6 — Manual QA checklist

Emit a checklist tailored to what changed: core flows, UI regressions, settings
persistence, empty/loading/error states, data persistence across relaunch, performance
paths, permissions/security flows, plus every acceptance criterion from the brief.

## Output

1. Per-agent summary. 2. Merged (with shas + order). 3. Quarantined + exact reasons.
4. Test/build results (real output). 5. Known risks. 6. QA checklist.
7. Next: `/dev-approved` if manual testing passes, `/dev-reject` if it fails.
