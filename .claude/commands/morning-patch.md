---
description: Plan the day's patch — inspect repo, prioritize issues, write briefs, create per-agent worktrees off dev, emit copy-paste agent prompts. Never writes product code.
argument-hint: "[optional issue filter / theme]"
---

# /morning-patch — plan & launch parallel work (generic, agent-agnostic)

You are the **orchestrator / release engineer** for this project. This command PLANS work
and hands it to coding agents. It never writes product code, never pushes, never releases,
never makes paid/cloud calls. Works identically from Claude Code, Codex, Cursor,
Antigravity, Cline, or OpenCode.

Optional filter from the user: `$ARGUMENTS`

## Step 0 — Discover project context (do this first, every time)

1. Read `CLAUDE.md` and/or `AGENTS.md` in the repo root — build/test commands, constraints,
   design rules. Those files OVERRIDE anything generic below.
2. Detect repo: `git remote get-url origin` (for `gh issue list --repo <owner/repo>`).
3. Detect base branch: use `dev` if it exists (`git show-ref --verify --quiet refs/heads/dev`),
   else `main`. Create `dev` from `main` if the project's docs say the flow uses one.
4. Detect build system (Package.swift / project.yml+xcodegen / package.json / pyproject.toml)
   and note the real test command.

## Step 1 — Inspect state

Summarize concisely: current branch + `git status --short` + recent commits +
`git worktree list`; open issues (`gh issue list --state open --limit 50`, fall back to
`tasks/BACKLOG.md` / `tasks/todo.md` if gh unauthenticated); `rg -n 'TODO|FIXME|HACK'`
(capped); test status if a cheap test command exists.

## Step 2 — Prioritize

Score candidates: `priority = user_impact × release_value ÷ implementation_risk`.
Order ties by dependency (blockers first), then parallelization potential (independent
file scopes). Select ≤ 4 work packages that can land today. **Never assign two agents
overlapping files.**

## Step 3 — Assign agents

- Taste-critical UI → **Claude Code** with the `padzy-os` skill if available; otherwise
  inline the project's design tokens verbatim from CLAUDE.md/AGENTS.md into the prompt.
- Bounded core/logic with clear contracts → Codex.
- Broad multi-file refactors → Cursor.
- Mechanical/bulk transforms, test generation → cheapest capable agent.
- Skills (`padzy-os`, `superpowers`, etc.) run only in agents that have them installed —
  if the executing agent lacks a skill, INLINE its relevant rules as plain text.

## Step 4 — Write the brief (audit trail)

Create `tasks/patch-bibles/$(date +%F).md` (or `tasks/briefs/` if the project uses that):
selected issues + why, branch/worktree, agent, exact in/out scope, files involved,
acceptance criteria, tests required, design constraints, risks, merge order, rollback.

## Step 5 — Worktrees off the base branch

For each package (slug = kebab issue name):

```bash
mkdir -p ../<project>-worktrees
git worktree add ../<project>-worktrees/$(date +%F)-<slug> -b patch/$(date +%F)/<slug> <base>
# install repo pre-commit hook into the worktree if one exists
HOOK=.claude/hooks/pre-commit
[ -f "$HOOK" ] && cp "$HOOK" "$(git -C ../<project>-worktrees/$(date +%F)-<slug> rev-parse --git-path hooks/pre-commit)" && chmod +x "$(git -C ../<project>-worktrees/$(date +%F)-<slug> rev-parse --git-path hooks/pre-commit)"
```

## Step 6 — Emit one copy-paste prompt per agent

Every prompt MUST begin:

```
cd <ABSOLUTE worktree path>
Work ONLY in this directory. Never touch the main repo or another worktree.
```

Then: agent + branch, pointer to the brief + work package, issue, scope IN/OUT,
acceptance criteria, exact test command (from Step 0), design rules inlined if the agent
can't run skills. End with: commit small reviewable commits in the worktree only; do NOT
merge/push/PR; append a completion note to the brief when done; then stop.

## Output

1. Prioritized plan (scored table). 2. Worktree map (path → branch → agent).
3. Agent prompts (one fenced block each). 4. Next step: run `/agents-done` after agents commit.

Do not launch external agents yourself — the user dispatches the prompts.
