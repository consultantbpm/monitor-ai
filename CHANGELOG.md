# Changelog

## 0.6.0

- **Inline highlighting** of the exact secret / credential / PII bytes inside open editors (🔴 secret · 🟠 credential · 🟡 PII), with overview-ruler markers and hover details. Toggle via `aiExposure.highlightSensitive.enabled`.
- **PSDE dashboard section** — new "🛡 PSDE — Proactive Sensitive Data Exposure" chapter below the projects table, listing every detected sensitive file grouped by project, with category badges and one-click **Open** (opens + highlights without tripping the PSDE pre-flight prompt).
- **Open button in the sensitive-file review picker** — inspect a file mid-review without closing the picker; opening from review/dashboard no longer triggers the PSDE modal.
- **Dashboard cleanup** — removed the red status dots and the `Current` mini-bar column; added a color-coded **Exposed F** (exposed files) column; `Exposed L` is now color-coded on the same thresholds; exposed and sensitive file paths are shown in red.
- Sensitive file lists are now persisted per project so the dashboard can show them across all tracked workspaces.

## 0.5.0

- Secrets / PII / credentials detection, AI-tools banner, live sensitive alert; cross-IDE (Cursor / Windsurf / VSCodium). Licensing moved to EULA.

## 0.4.1

- Threshold colors on fill bars + miniBars; project names in the All Projects table.

## 0.4.0

- Secrets/PII/credentials detection, AI tools banner, live sensitive alert, cross-IDE support.

## 0.3.0

- Threshold colors (dark-orange >25%, red >50%), red live theme, projects sorted by exposure.

## 0.2.3

- Initial release.
