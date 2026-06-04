# Promotion Playbook — AI Code Exposure Monitor

All copy is ready to paste. Pick a launch day (Tuesday or Wednesday), then go down the list in order.

---

## 0. Pre-launch checklist (do this BEFORE launch day)

- [ ] Wait until marketplace listing is live: https://marketplace.visualstudio.com/items?itemName=ConsultantBPMhumansoftware.ai-code-exposure-monitor
- [ ] Record a **15–25 s GIF** showing the live sparkline + feed + animated counters reacting to opening a few files. Use [ScreenToGif](https://www.screentogif.com/) or [LICEcap](https://www.cockos.com/licecap/). Target ~3 MB max.
- [ ] Add the GIF to `README.md` near the top, push to GitHub, then `vsce publish patch` (so marketplace gets the GIF).
- [ ] Take 3 PNG screenshots: status bar + sidebar live, dashboard live monitor, all-projects table. Upload them as marketplace gallery images.
- [ ] Sign up on ProductHunt **at least 7 days before launch** (new accounts get throttled).
- [ ] Sign up on Hacker News if you don't have an account (Show HN allowed after 1 day of account age).
- [ ] Line up **5 friends/colleagues** willing to upvote on ProductHunt in the first hour.
- [ ] Pick launch date: **Tuesday or Wednesday**, week without major tech events.

---

## 1. Launch day — exact timing (US time)

| Time (PST) | Time (EET) | Action |
|---|---|---|
| 00:01 | 10:01 | Submit on **Product Hunt** |
| 06:00 | 16:00 | Post **Show HN** on Hacker News |
| 06:15 | 16:15 | Post on **r/vscode** |
| 07:00 | 17:00 | Post **LinkedIn** + **X thread** |
| 08:00 | 18:00 | Post on **r/ChatGPTCoding** + **r/cybersecurity** |
| 10:00 | 20:00 | Publish **Dev.to article** |
| 13:00 | 23:00 | Post on **r/programming** (after main thread momentum) |

Stagger Reddit posts by ≥30 min — multiple identical posts at once gets flagged as spam.

---

## 2. Product Hunt

**Name:** AI Code Exposure Monitor

**Tagline (60 char):**
> Live % of your code that AI assistants have seen

**Description (260 char):**
> A VS Code extension that shows in your status bar what percentage of your codebase has been opened in the editor — i.e. potentially streamed to Copilot, Claude, Cursor or other AI tools. Live sparkline, per-project peaks, 100% local. No telemetry.

**First comment (post this yourself within 1 minute of going live):**
> Hi PH 👋 I built this because I realized I had no idea how much of my codebase had been pulled into AI context windows over the last few months. The number was higher than I expected — and I think most devs are in the same situation.
>
> The extension is intentionally simple:
> – the **% of source code opened in your editor**, live in the status bar
> – per-project peaks, retained across restarts, so you can see your worst-case exposure
> – sparkline + activity feed so you can watch it move
> – 100% local, no telemetry, no network calls
>
> Open to feedback — the next features I'm considering are export to JSON for compliance audits and an optional "exposure budget" alert when you exceed a target. What would you actually use?

**Topics:** Developer Tools, Productivity, Privacy, Artificial Intelligence

**Gallery:** GIF first (auto-plays), then 2 PNGs.

---

## 3. Hacker News (Show HN)

**Title (80 char max):**
> Show HN: I built a VS Code extension that tracks how much code AI tools have seen

**URL:** marketplace URL (not GitHub — gets more clicks)

**First comment (post within 60s of submission):**
> Author here. The idea: every time you open a file in VS Code, it can be picked up as context by Copilot, Claude, Cursor, Continue, or whatever AI extension you have running. Most of us have no idea what fraction of our codebase that adds up to over a week.
>
> The extension counts `exposed_lines / total_lines` from files you've actually opened (per project), and shows it live in the status bar. Peaks are persisted across restarts so you can see your worst-case surface area. There's a sparkline + activity feed for the live view, and everything is stored in VS Code globalState — no network, no telemetry.
>
> Things I deliberately did NOT do:
> – I don't hook into the AI extensions themselves. I count opens, not actual tokens streamed. The real number is somewhere ≤ what I show, but exposure ≠ leak in any case; this is a *surface area* metric, not a leak detector.
> – I don't try to be smart about partially-opened files. Open = exposed, full count. This is intentional: I'd rather over-count than give people false reassurance.
>
> Source: https://github.com/consultantbpm/monitor-ai
> Marketplace: https://marketplace.visualstudio.com/items?itemName=ConsultantBPMhumansoftware.ai-code-exposure-monitor
>
> Happy to answer questions.

---

## 4. Reddit

### r/vscode

**Title:** Built a VS Code extension that shows live what % of your code AI tools have seen

**Body:**
> Quick share of an extension I just published.
>
> It puts a `👁 AI exposure: 37.4%` indicator in your status bar showing how much of your current workspace has been opened in the editor (and therefore is potentially visible to whatever AI extension you have running — Copilot, Claude, Cursor, Continue, etc.).
>
> Features:
> - Live sparkline of % over the last 60 seconds
> - Per-project peaks retained across restarts
> - Activity feed (file opened, modified, created, deleted)
> - Multi-project dashboard
> - 100% local — no network, no telemetry
>
> Marketplace: https://marketplace.visualstudio.com/items?itemName=ConsultantBPMhumansoftware.ai-code-exposure-monitor
> Source: https://github.com/consultantbpm/monitor-ai
>
> Feedback welcome, especially on what threshold you'd consider "too much exposure" for your projects.

### r/ChatGPTCoding

**Title:** I built a tool to measure how much of my code Claude/Copilot/Cursor have actually seen

**Body:**
> If you use AI tools daily for coding, here's a question: what % of your codebase has been pulled into an AI context window in the last week?
>
> Most of us have no idea. I built this because I wanted a number.
>
> It's a VS Code extension that counts file opens against total source lines and shows a live %. Doesn't matter which AI assistant you use — the metric is "what could the AI have seen," not "what did it actually use."
>
> Marketplace: https://marketplace.visualstudio.com/items?itemName=ConsultantBPMhumansoftware.ai-code-exposure-monitor
>
> Useful if you're:
> - Mixing AI tooling with proprietary code and want awareness
> - On a team that wants a shared heuristic ("keep peak under 60%")
> - Just curious about the actual number

### r/cybersecurity

**Title:** VS Code extension for measuring AI tooling exposure surface on source code

**Body:**
> Sharing a small tool that may be useful for anyone auditing developer-side AI exposure.
>
> Problem: AI assistants in IDEs (Copilot, Claude, Cursor, Continue, etc.) can pick up file content as context. Most teams have no visibility into the cumulative fraction of a codebase that has been put in front of an AI agent.
>
> The extension measures `exposed_lines / total_lines` per workspace, where "exposed" = opened in the editor this session (or previously, if persistence is on). Retains peaks per project across restarts so worst-case can be audited later. 100% local — globalState only, no network.
>
> Useful as a heuristic before any of the heavier compliance work (egress filtering, MCP guards, DLP). It's a measurement layer, not a control.
>
> Marketplace: https://marketplace.visualstudio.com/items?itemName=ConsultantBPMhumansoftware.ai-code-exposure-monitor
> Source: https://github.com/consultantbpm/monitor-ai

### r/selfhosted

**Title:** Privacy-first VS Code extension: shows how much of your code has been opened to AI assistants

**Body:**
> If you're privacy-conscious about AI tooling in your IDE, here's something I built.
>
> All it does: counts files you've opened against total source lines, shows the live percentage in the status bar. The point is to make AI exposure surface visible, not to control it.
>
> - 100% local. No network. No telemetry.
> - State lives in VS Code's globalState only.
> - Reset / Forget commands wipe data immediately.
> - Source is open: https://github.com/consultantbpm/monitor-ai
>
> Marketplace: https://marketplace.visualstudio.com/items?itemName=ConsultantBPMhumansoftware.ai-code-exposure-monitor

### r/programming

**Title:** Measuring AI exposure surface in your codebase — a VS Code extension experiment

**Body:**
> Small experiment I shipped: a VS Code extension that puts a live `% AI exposure` indicator in the status bar — i.e. what fraction of your workspace source code has been opened in the editor (and could have been pulled into an AI agent's context).
>
> Implementation notes:
> - `total_lines` from glob-filtered source files, counted lazily on rescan
> - `exposed` set persisted in globalState, keyed by absolute path
> - Debounced re-count on file change (800 ms), to avoid thrashing during fast typing
> - Per-project peaks retained across VS Code restarts, with timestamps
> - Sidebar webview pulls a live activity feed via a typed EventEmitter, rolling 60s sparkline rendered as SVG, animated counters via requestAnimationFrame
> - No network, no telemetry — measurement only
>
> Source: https://github.com/consultantbpm/monitor-ai
> Marketplace: https://marketplace.visualstudio.com/items?itemName=ConsultantBPMhumansoftware.ai-code-exposure-monitor
>
> Curious what other "soft" privacy/exposure metrics people would find useful.

---

## 5. LinkedIn post

```
I just published a free VS Code extension and the underlying question is one I think most engineering teams have never actually answered:

"What percentage of your codebase has been seen by an AI assistant this week?"

Most teams have no idea. Copilot, Claude, Cursor, Continue, Gemini — each one of these can pull file content into a context window. Multiplied across a team, across weeks, the cumulative exposure surface is often surprising.

So I built a small measurement tool.

📊 AI Code Exposure Monitor adds a live `👁 AI exposure: 37.4%` indicator to your VS Code status bar. It counts files you've opened (in this or any past session) against your total source line count. Per-project peaks are retained across restarts, so you can audit the worst case.

A few intentional design decisions:
→ 100% local. No telemetry. State lives in VS Code globalState only.
→ Measurement, not control. The extension doesn't block anything — it just makes the number visible.
→ Exposure ≠ leak. But exposure IS the precondition for a leak, and you can't manage what you don't measure.

Useful for:
• Solo devs who want awareness without changing their tooling
• Teams agreeing on a heuristic ("keep peak below 60%")
• Engineering leaders giving CISOs/legal an honest answer

It's free, MIT licensed, and the source is on GitHub.

Marketplace: https://marketplace.visualstudio.com/items?itemName=ConsultantBPMhumansoftware.ai-code-exposure-monitor
Source: https://github.com/consultantbpm/monitor-ai

If you try it, I'd love to hear what % you actually see. The number says more about your workflow than you'd think.

#VSCode #AICoding #DeveloperTools #SoftwareEngineering #InfoSec
```

---

## 6. X / Twitter thread

**Tweet 1:**
> I built a VS Code extension that answers a question almost no engineering team has asked:
>
> what % of your codebase has been seen by AI assistants this week?
>
> live in the status bar.

**Tweet 2:**
> every file you open in VS Code can be picked up as context by Copilot, Claude, Cursor, Continue, etc.
>
> the cumulative number is almost always higher than you'd guess.
>
> the extension just counts it and shows it. nothing fancy.

**Tweet 3:**
> design decisions worth flagging:
>
> – 100% local. no telemetry. state lives only in globalState.
> – peaks retained across restarts → audit your worst case
> – exposure ≠ leak, but exposure IS the precondition for a leak

**Tweet 4:**
> works alongside any AI extension you already have.
>
> it's a measurement layer, not a control layer.
>
> useful as a heuristic: "keep peak below 60%". simple, sticky, actionable.

**Tweet 5:**
> free, MIT, ready to install:
>
> 🌐 https://marketplace.visualstudio.com/items?itemName=ConsultantBPMhumansoftware.ai-code-exposure-monitor
> ⭐ https://github.com/consultantbpm/monitor-ai
>
> would love to know what % you see. reply with screenshots if curious.

---

## 7. Dev.to article (full draft, 1200 words)

**Title:** I built a VS Code extension to measure how much of my code AI assistants have seen

**Tags:** vscode, ai, productivity, privacy

```markdown
# I built a VS Code extension to measure how much of my code AI assistants have seen

A few weeks ago I noticed something odd. I had Copilot, Claude, and Cursor all installed at different times, plus a couple of MCP servers running. Over a sprint, every one of these tools had pulled some chunk of my source code into a context window. But I couldn't have told you — even within an order of magnitude — what percentage of my codebase had actually been seen.

I went looking for a tool that would measure this. There wasn't one. So I built one.

## What "exposure" means here

A file counts as **exposed** the moment it's opened in the editor — active tab or background tab, this session or any prior session. The metric is straightforward:

```
percent = exposed_lines / total_lines × 100
```

Where:
- `total_lines` is the sum of newline-counted lines across all source files matching `aiExposure.includeGlobs` and not matching `aiExposure.excludeGlobs`. Defaults cover the usual suspects: `**/*.{ts,tsx,js,py,go,rs,…}`, excluding `node_modules`, `dist`, `.git`, etc.
- `exposed_files` ⊆ all indexed files. Files outside the include globs (e.g. node_modules) are ignored on both sides.

Important: this is a **surface area** metric, not a leak detector. I'm counting what *could* have been pulled into AI context, not what actually was. The real number is somewhere ≤ what the extension shows. Even so, just having the upper bound visible is enough to change behavior.

## Design decisions I made deliberately

### 1. Open = exposed, full count

I considered weighing partial reads, scroll position, hover-only opens, etc. I rejected all of it.

The reasoning: I'd rather over-count than give people false reassurance. If a file is opened, assume the AI tool could have streamed it. The point of the metric is to be a conservative upper bound.

### 2. 100% local. No telemetry. No network.

State lives in VS Code's `globalState`. Reset and Forget commands wipe it immediately. Nothing leaves your machine.

This is non-negotiable for a tool whose entire purpose is privacy awareness. Sending exposure data to a server would be hilariously self-defeating.

### 3. Per-project peaks, retained across restarts

The "worst case" matters more than "today's number." A peak of 78% reached last Tuesday tells you something the current 23% doesn't. The extension keeps peaks per workspace, with timestamps, across VS Code restarts.

### 4. Live UI, but boring

Status bar indicator. Optional sidebar webview. Optional dashboard panel. The sidebar and dashboard both have a collapsible "Live monitor" section with a sparkline (60s × 1 sample/s), an activity feed (file opened / modified / created / deleted), and a heartbeat dot that pulses on every event.

Animated counters for "exposed lines" / "exposed files" — green when going up, red when going down. Animated so you actually *see* the change, not just read a number.

Everything live can be collapsed if you find motion distracting. The state persists per webview.

## A few implementation notes

The tracker maintains two in-memory data structures:

- `fileIndex: Map<fsPath, { lines }>` — built by `vscode.workspace.findFiles()` filtered by include/exclude globs, with a size cap to skip lockfiles
- `exposed: Set<fsPath>` — augmented whenever `onDidOpenTextDocument` or `onDidChangeActiveTextEditor` fires

Two persistence stores:
- `aiExposure.exposedFiles:<workspacePath>` → the exposed file set, per workspace
- `aiExposure.projects` → all-time metrics, peaks, timestamps for every workspace ever opened

File changes trigger a debounced re-count (800 ms) so fast typing doesn't thrash. File creates/deletes update both the index and the exposed set atomically. Deletions are propagated to `exposed` too — a deleted file can't stay marked as exposed.

The activity feed and sparkline live in the webviews, fed by a typed `EventEmitter<ActivityEvent>` from the tracker. The sparkline is rendered as an inline SVG path, updated every second from a 60-sample rolling buffer. No charting library — at this scale a hand-rolled `d` attribute is faster and smaller.

## What surprised me

After running it for a week on my main project, my peak hit 81%. I expected ~40. The difference is a few files I sometimes glance at for context — `package.json`, `tsconfig`, a couple of shared utility modules — that I didn't think of as "opened" but were tracked all the same.

That number changed how I work. Not dramatically. But I close tabs more aggressively now, and I think twice before opening a file just to "have a look."

That's exactly the behavior I wanted to provoke.

## What it doesn't do (yet)

- Per-AI breakdown. I'd need to hook into each extension's API, which is brittle.
- Token-level estimation. Lines are a rough proxy; tokens vary by language and content.
- Team-level aggregation. Single-developer only right now.
- Export for compliance reports. Coming.

## Try it

Marketplace: https://marketplace.visualstudio.com/items?itemName=ConsultantBPMhumansoftware.ai-code-exposure-monitor
Source: https://github.com/consultantbpm/monitor-ai

MIT licensed. Free for everyone. I'd love to hear what number you see — replies welcome.
```

---

## 8. Newsletter outreach (5 templates)

### Template (general)

```
Subject: Show & tell: VS Code extension for measuring AI exposure surface

Hi [NAME],

I'm a reader of [NEWSLETTER] and I just shipped a small VS Code extension that I think might fit one of your "shipped" or "tools" segments.

It measures the live % of your source code that has been opened in the editor — and therefore is potentially visible to whichever AI extensions you have running (Copilot, Claude, Cursor, Continue, etc.). 100% local, no telemetry. The point is to make AI tooling exposure surface visible without changing anyone's workflow.

Marketplace: https://marketplace.visualstudio.com/items?itemName=ConsultantBPMhumansoftware.ai-code-exposure-monitor
GIF demo: [LINK TO GIF]
Source: https://github.com/consultantbpm/monitor-ai

No PR ask — just thought you might find it relevant for [NEWSLETTER]'s audience. Happy to answer any questions.

— [YOUR NAME]
```

### Specific recipients

| Newsletter | Submit to / Editor |
|---|---|
| TLDR Newsletter | submissions@tldrnewsletter.com |
| Pointer (engineering leaders) | hello@pointer.io |
| Console (open-source tools) | console.dev (form on site) |
| Bytes (JS/frontend) | bytes.dev/submit |
| The Pragmatic Engineer | gergely@pragmaticengineer.com (Friday issue tips) |
| Cron.weekly | mattias@cronweekly.com |
| Software Lead Weekly | oren@softwareleadweekly.com |

---

## 9. Podcast outreach

```
Subject: Pitch — privacy-first VS Code extension for AI tooling

Hi [HOST],

Long-time listener of [PODCAST]. I just shipped a small but opinionated VS Code extension that measures the live % of your codebase that has been seen by AI assistants. It made me change my own coding habits within a week, which I think makes it a decent 5-minute story.

Happy to come on briefly, or just provide a one-paragraph blurb if you do a "shipped this week" segment.

Demo & marketplace links: https://marketplace.visualstudio.com/items?itemName=ConsultantBPMhumansoftware.ai-code-exposure-monitor

— [YOUR NAME]
```

Send to:
- The Changelog (editors@changelog.com)
- Software Engineering Daily (jeff@softwareengineeringdaily.com)
- Syntax (wes@syntax.fm / scott@syntax.fm)

---

## 10. Week 1–4 follow-up plan

### Week 1
- Reply to every comment on PH, HN, Reddit, X within 2h during waking hours.
- If HN front page: don't break the conversation. Keep replies short, on-topic.
- Take notes on most-requested features.

### Week 2
- Publish first **patch update** addressing top 3 feedback items.
- Write a "lessons from launch" post on Dev.to and LinkedIn (`/lp tcm-decide` style — what you'd do differently).
- Reach out to 5 dev influencers with a personalized 2-line pitch and a GIF.

### Week 3
- Submit to **awesome-vscode** GitHub lists (PR).
- Add YouTube short (60s) walking through the extension.
- Cross-promote with pandō (humansoftware) — joint LinkedIn post.

### Week 4
- Write a longer technical deep-dive on the implementation (live event bus, animated counters, SVG sparkline without a library). Target Hacker News again with a different angle.
- Add internationalization (Romanian + 2 other languages) for the README — small SEO bump, signals serious project.

---

## 11. Metrics to track

Marketplace publisher hub (https://marketplace.visualstudio.com/manage/publishers/ConsultantBPMhumansoftware/extensions/ai-code-exposure-monitor/hub) shows:

- Daily installs
- Trending rank
- Rating

External:
- GitHub stars/forks
- ProductHunt votes + position
- HN upvotes + comments
- Reddit upvotes + saved
- LinkedIn impressions + reposts
- X impressions

Set a 30-day target:
- **1,000 installs** = solid first-month launch
- **100 GitHub stars** = product-market signal
- **3 mentioning newsletters** = SEO multiplier

---

## 12. Things NOT to do

- ❌ Don't post the same text on multiple subreddits — auto-mod and users notice.
- ❌ Don't ask for upvotes publicly. Ask 5 friends privately, then stop.
- ❌ Don't reply defensively to criticism. Acknowledge, file as feedback, move on.
- ❌ Don't launch on Monday (people are catching up) or Friday/weekend (no traction).
- ❌ Don't oversell. The extension is honest and small. Sell it as honest and small.

---

## Quick links to keep handy

- Marketplace listing: https://marketplace.visualstudio.com/items?itemName=ConsultantBPMhumansoftware.ai-code-exposure-monitor
- Publisher hub: https://marketplace.visualstudio.com/manage/publishers/ConsultantBPMhumansoftware
- GitHub: https://github.com/consultantbpm/monitor-ai
- vsce CLI: `vsce publish patch` for updates
