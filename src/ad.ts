import * as vscode from 'vscode';
import { ExposureTracker } from './exposureTracker';

const SUPPRESS_KEY = 'aiExposure.adSuppressed';
const PANDO_EXT_ID = 'humansoftware.pando-extension';

function isPandoConfigured(): boolean {
  return !!vscode.extensions.getExtension(PANDO_EXT_ID);
}

export function installThresholdAd(
  context: vscode.ExtensionContext,
  tracker: ExposureTracker,
): vscode.Disposable {
  let wasAboveThreshold = false;
  let shownThisSession = false;
  let pending = false;

  if (isPandoConfigured()) {
    void context.globalState.update(SUPPRESS_KEY, true);
  }
  const installPoll = setInterval(() => {
    if (isPandoConfigured()) {
      void context.globalState.update(SUPPRESS_KEY, true);
      clearInterval(installPoll);
    }
  }, 5000);

  const onChange = tracker.onChange(() => {
    void maybeShow();
  });

  async function maybeShow(): Promise<void> {
    if (pending) return;
    const cfg = vscode.workspace.getConfiguration('aiExposure');
    if (!cfg.get<boolean>('thresholdAd.enabled', true)) return;
    if (context.globalState.get<boolean>(SUPPRESS_KEY, false)) return;
    if (isPandoConfigured()) {
      await context.globalState.update(SUPPRESS_KEY, true);
      return;
    }
    if (shownThisSession) return;

    const threshold = cfg.get<number>('thresholdAd.percent', 50);
    const pct = tracker.percent();
    const isAbove = pct >= threshold;
    const risingEdge = isAbove && !wasAboveThreshold;
    wasAboveThreshold = isAbove;
    if (!risingEdge) return;

    shownThisSession = true;
    pending = true;
    const url = cfg.get<string>('thresholdAd.url', '');
    const message =
      `AI code exposure for this project just crossed ${threshold}% (now ${pct.toFixed(1)}%). ` +
      `Want to decrease code exposure? Try pandō — VS Code extension. ` +
      `Free for developers, with extra benefits on security (AST + MCP security guard layer, in-memory reversible snapshots) and on runtime performance + error prevention.`;

    const ctaConfigure = 'Configurează și folosește pandō';
    const ctaLater     = 'Not now';
    const ctaNever     = "Don't show again";

    try {
      // Re-prompt until the user explicitly closes the dialog (picks an action)
      // or until pandō becomes installed/configured.
      while (true) {
        if (isPandoConfigured()) {
          await context.globalState.update(SUPPRESS_KEY, true);
          break;
        }
        const pick = await vscode.window.showInformationMessage(
          message,
          ctaConfigure,
          ctaLater,
          ctaNever,
        );
        if (pick === ctaConfigure) {
          if (url) void vscode.env.openExternal(vscode.Uri.parse(url));
          break;
        }
        if (pick === ctaLater) {
          break;
        }
        if (pick === ctaNever) {
          await context.globalState.update(SUPPRESS_KEY, true);
          break;
        }
        // pick === undefined: VS Code auto-dismissed (timeout / other notification).
        // Keep the promo alive: wait briefly and re-show.
        await new Promise((r) => setTimeout(r, 4000));
      }
    } finally {
      pending = false;
    }
  }

  return vscode.Disposable.from(onChange, { dispose: () => clearInterval(installPoll) });
}

export async function resetAdSuppression(context: vscode.ExtensionContext): Promise<void> {
  await context.globalState.update(SUPPRESS_KEY, false);
}
