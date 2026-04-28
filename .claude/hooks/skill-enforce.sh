#!/bin/bash
# Skill enforcement hook — injects reminder on every user prompt
cat <<'REMINDER'
⚠️ SKILL CHECK REQUIRED — Before responding, match user's request against this table:

| User wants to...                    | MUST invoke skill FIRST            |
|-------------------------------------|------------------------------------|
| Build/add/create anything           | superpowers:brainstorming          |
| Multi-step task (3+ steps)          | superpowers:writing-plans          |
| Execute a written plan              | superpowers:executing-plans        |
| Write implementation code           | superpowers:test-driven-development|
| Build UI component/page             | frontend-design:frontend-design    |
| Fix bug / test failure              | superpowers:systematic-debugging   |
| Claim work is done / commit         | superpowers:verification-before-completion |

If ANY skill matches, invoke it via Skill tool BEFORE doing anything else. No exceptions.
REMINDER
