# FounderScope — Agent Instructions

See CLAUDE.md (if present) for project-specific build/test commands and constraints.

<!-- agent-sync:start -->
## Cross-agent orchestration (managed by agent-sync — do not edit inside markers)

This project uses an agent-agnostic patch workflow. Any coding agent (Claude Code, Codex,
Cursor, Antigravity, Cline, OpenCode) can orchestrate it.

**Workflows** (canonical: `.claude/commands/`; mirrored at `.cursor/commands/`,
`.clinerules/workflows/`, `.opencode/command/`, `.agent/workflows/`):
- `morning-patch` — plan the day's patch, create worktrees, emit agent prompts
- `agents-done` — verify + merge agent worktrees into dev, build for manual QA
- `dev-approved` — manual QA passed: prepare release candidate (never merges to main)
- `dev-reject` — manual QA failed: trace, fix-forward or revert

If your agent has no slash-command support, just READ the workflow file and follow it.

**Skills** (portable): `~/.claude/skills/padzy-os/SKILL.md` (Padzy design system — read it
before any UI work) and `~/.claude/skills/staff-engineer-workflow/SKILL.md` (engineering
standards). If your agent can't load skills, read the SKILL.md directly.

**MCP**: `shadcn` server configured in `.mcp.json` (Claude Code/Codex format); the same
server is registered globally for Cursor, Cline, OpenCode, and Antigravity.

**Hooks**: the repo's pre-commit gate is installed as a native git hook, so it runs no
matter which agent commits. Do not bypass it (`--no-verify` is forbidden).

**Worktree rule**: multi-agent work happens in `../FounderScope-worktrees/` — one agent per
worktree, prompts must start with `cd <absolute-worktree-path>` and "work ONLY in this
directory".
<!-- agent-sync:end -->
