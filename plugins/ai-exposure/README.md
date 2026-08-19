# AI Code Exposure Monitor & Prevention — Claude Code plugin

Live percentage of your code that has been seen by AI, plus a gate that stops
secrets, credentials and PII from reaching the model's context in the first place.

Everything runs locally. Nothing is uploaded, and there is no telemetry.

## What it does differently from the VS Code extension

The [VS Code extension](https://marketplace.visualstudio.com/items?itemName=ConsultantBPMhumansoftware.ai-code-exposure-monitor)
infers exposure: a file was opened in the editor, so an AI assistant *probably*
saw it. The warning arrives after the file is already open.

In Claude Code the plugin sits on `PreToolUse`, which fires **before** the tool
call runs. That means:

- **Exposure is measured, not estimated.** Only files Claude actually read count.
- **The gate really blocks.** A file with an AWS key in it can be denied outright,
  so the contents never enter the context window.

Both products share one detection engine — `lib/secrets.js` is compiled from the
extension's `src/secrets.ts`, so the two can never disagree about what a secret is.

## Install

```
/plugin marketplace add consultantbpm/monitor-ai
/plugin install ai-exposure@monitor-ai
```

Requires Node.js on `PATH`. No npm dependencies.

## Usage

`/exposure` reports the current project. From a shell:

```
node bin/exposure.js report                      # text summary
node bin/exposure.js report --html out.html      # dashboard
node bin/exposure.js report --json               # machine-readable
node bin/exposure.js approve src/config.ts       # stop gating this file
node bin/exposure.js mark-test fixtures/keys.txt # flag as test data
node bin/exposure.js reset                       # clear this project's state
```

## Configuration

Edit `config.json` in the plugin directory, or place your own at
`~/.claude/ai-exposure/config.json` (it wins).

| Key | Default | Meaning |
| --- | --- | --- |
| `mode` | `"ask"` | `block` denies the read, `ask` prompts you, `warn` allows and records, `off` disables the gate |
| `gateOn` | `["secret","credential"]` | Categories that trigger the gate. Add `"pii"` for stricter handling — expect more prompts in test fixtures |
| `maxFileSizeKB` | `2048` | Files larger than this are not scanned or counted |
| `trackExposure` | `true` | Set `false` to keep the gate but stop recording |

State lives in `~/.claude/ai-exposure/<project>-<hash>.json`, one file per project.

## What is detected

Ten path patterns (`.env`, `id_rsa`, `.pem`, `.aws/credentials`, kubeconfig, GCP
service accounts, …) and twenty-four content patterns across three categories:

- **secret** — private key blocks, AWS keys, GitHub PATs, OpenAI/Anthropic keys,
  Google API keys, SendGrid, Slack tokens, database URLs with inline passwords
- **credential** — hardcoded passwords and usernames, bearer tokens, basic auth
- **pii** — emails, SSNs, credit card numbers, phone numbers, dates of birth, IBANs

## Design note

`hooks/hooks.json` contains no logic. It is a thin wire to `bin/exposure.js`, so
the behaviour can be tested outside a Claude session and the same core can be
wrapped as an MCP server later without touching the hooks.

## Contact

ConsultantBPM Human Software
<consultantbpm@gmail.com>
<https://github.com/consultantbpm/monitor-ai>

Issues: <https://github.com/consultantbpm/monitor-ai/issues>

## Licence

See [LICENSE](../../LICENSE).
