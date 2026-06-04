<!-- teachcm:start -->
## Teach CLAUDE.md — managed section

*This block is auto-managed by the Teach CLAUDE.md extension. Edit content outside the markers; this block will be rewritten.*

**Knowledge base layout for this project:**
- `.teachcm/notes/` — project-scoped learnings (saved via `/lp`).
- `.teachcm/pending/` — captures awaiting user review (Claude writes here).
- `.teachcm/.meta/tags.json` — existing tags; prefer these when proposing new captures.
- `~/.teachcm/notes/` — cross-project learnings (saved via `/l`).

**Slash commands installed in `.claude/commands/`:**
- `/lp <hint?>` — learn for this project (writes to project pending dir).
- `/l <hint?>` — learn globally (writes to ~/.teachcm/pending/).
- `/ps <screenshot-path>` — check screenshot against requirements, propose fix prompt.
- `/log <area?>` — instrument tracing at key points, then analyze logs.
- `/t <feature?>` — propose a test plan; implement only after user agrees.
- `/m <description?>` — generate or iterate a UI mockup (HTML + Tailwind) in `.tcm-mockups/`.
- `/td <feature?>` — build + install + smoke-test the current feature on a connected device (Android via adb, provisional).
- `/clp [n?]` — show last N slash commands invoked (history clipboard, default 100).
- `/tcm-decide <decizie>` — record an Architecture Decision Record (ADR) in `.teachcm/decisions/`.
- `/tcm-status` — quick dashboard of library / pending / decisions / mockups / token budget.
- `/tcm-context <topic>` — build a single context bundle (markdown) for a fresh Claude session.
- `/tcm-portfolio [sync|preview|init|add-target|list-targets]` — sync developer app portfolio from Google Sheets, distribute `portfolio.json` to Android apps.

**Behavior contract for `/l` and `/lp`:**
- If the insight is clear, write `<timestamp>-<slug>.json` to the appropriate `pending/` directory and announce a one-line summary.
- If ambiguous, ask 1–2 clarifying questions and do NOT write a file.
- Always prefer existing tags from `tags.json`. Lowercase kebab-case. 2–5 tags.
<!-- teachcm:end -->
