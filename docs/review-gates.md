# Review gates

`dev` is the integration branch where parallel agent work merges continuously.
Gating `dev` would stall the fan-out, so it is intentionally ungated.

Only pull requests targeting `main` trigger automated review.

## Automated review

CodeRabbit is configured at the repository root in `.coderabbit.yaml` to run
only on PRs whose base branch is `main`:

```yaml
reviews:
  auto_review:
    enabled: true
    base_branches:
      - "main"
```

CodeRabbit's `base_branches` setting adds reviewed branches on top of the
repository default branch; it does not replace the default branch. Because the
default branch is `main`, listing `main` in `base_branches` is redundant but
makes the intent explicit. `dev` is neither the default branch nor listed in
`base_branches`, so PRs targeting `dev` do not trigger CodeRabbit. Direct pushes
to `dev` are not blocked by this gate.

## Manual gates before a release PR

Before opening any PR from `dev` to `main`, the orchestrator runs:

- `/simplify`
- `/security-review`

These are human-initiated passes, not automated CI jobs, and they happen before
the PR is opened.
