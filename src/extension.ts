import * as vscode from 'vscode';
import { ExposureTracker } from './exposureTracker';
import { createStatusBar } from './statusBar';
import { showDashboard } from './dashboard';
import { CurrentProjectViewProvider } from './currentProjectView';
import { installThresholdAd } from './ad';

const out = vscode.window.createOutputChannel('AI Code Exposure Monitor');

const ALERT_SUPPRESS_KEY = 'aiExposure.sensitiveAlertSuppressed';

function installSensitiveAlert(context: vscode.ExtensionContext, tracker: ExposureTracker): vscode.Disposable {
  const alertedPaths = new Set<string>();
  return tracker.onActivity(async (ev) => {
    if (ev.type !== 'exposed' || !ev.risk || ev.risk.length === 0 || !ev.path) return;
    const cfg = vscode.workspace.getConfiguration('aiExposure');
    if (!cfg.get<boolean>('sensitiveAlert.enabled', true)) return;
    if (context.globalState.get<boolean>(ALERT_SUPPRESS_KEY, false)) return;
    if (alertedPaths.has(ev.path)) return;
    alertedPaths.add(ev.path);
    const fname = ev.rel || ev.path;
    const top = ev.risk.slice(0, 3).join(', ');
    const more = ev.risk.length > 3 ? ` (+${ev.risk.length - 3} more)` : '';
    const pick = await vscode.window.showWarningMessage(
      `⚠ Sensitive file exposed to AI tools: ${fname} — ${top}${more}`,
      'Open dashboard',
      'Reset session',
      "Don't show again"
    );
    if (pick === 'Open dashboard') {
      await vscode.commands.executeCommand('aiExposure.showDashboard');
    } else if (pick === 'Reset session') {
      await vscode.commands.executeCommand('aiExposure.resetCurrent');
    } else if (pick === "Don't show again") {
      await context.globalState.update(ALERT_SUPPRESS_KEY, true);
    }
  });
}

export async function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(out);
  out.appendLine('[activate] start at ' + new Date().toISOString());

  const tracker = new ExposureTracker(context);

  context.subscriptions.push(createStatusBar(tracker));
  out.appendLine('[activate] status bar visible');

  const provider = new CurrentProjectViewProvider(tracker);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CurrentProjectViewProvider.viewType, provider)
  );
  out.appendLine('[activate] sidebar view registered');

  context.subscriptions.push(installThresholdAd(context, tracker));
  context.subscriptions.push(installSensitiveAlert(context, tracker));

  context.subscriptions.push(
    vscode.commands.registerCommand('aiExposure.showDashboard', () => {
      showDashboard(context, tracker);
    }),
    vscode.commands.registerCommand('aiExposure.resetCurrent', async () => {
      await tracker.reset();
      vscode.window.showInformationMessage('Current project exposure reset.');
    }),
    vscode.commands.registerCommand('aiExposure.resetPeaks', async () => {
      const pick = await vscode.window.showWarningMessage(
        'Reset peak exposure for ALL tracked projects?',
        { modal: true },
        'Reset peaks'
      );
      if (pick === 'Reset peaks') {
        await tracker.resetAllPeaks();
        vscode.window.showInformationMessage('Peaks reset.');
      }
    }),
    vscode.commands.registerCommand('aiExposure.forgetProject', async () => {
      const all = tracker.allProjects();
      const items = Object.values(all).map((p) => ({
        label: p.displayName,
        description: p.workspacePath,
        detail: 'Peak ' + p.peak.percent.toFixed(1) + '%  ·  Exposed ' + p.exposedLines.toLocaleString() + ' / ' + p.totalLines.toLocaleString() + ' lines',
        path: p.workspacePath,
      }));
      const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Forget which project?' });
      if (pick) {
        await tracker.forgetProject(pick.path);
        vscode.window.showInformationMessage('Forgot ' + pick.label + '.');
      }
    }),
    vscode.commands.registerCommand('aiExposure.rescan', async () => {
      await tracker.rescan();
      vscode.window.showInformationMessage('Workspace rescanned.');
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((ed) => {
      if (ed?.document) tracker.markExposed(ed.document.uri);
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      tracker.markExposed(doc.uri);
    }),
    vscode.workspace.onDidCreateFiles((e) => {
      for (const uri of e.files) void tracker.onFileCreated(uri);
    }),
    vscode.workspace.onDidDeleteFiles((e) => {
      for (const uri of e.files) tracker.onFileDeleted(uri);
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      tracker.onFileChanged(e.document.uri);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('aiExposure.includeGlobs')
       || e.affectsConfiguration('aiExposure.excludeGlobs')
       || e.affectsConfiguration('aiExposure.maxFileSizeKB')) {
        void tracker.rescan();
      }
    })
  );

  // Background init so activate() returns immediately and the status bar
  // appears before the (potentially slow) workspace scan completes.
  void (async () => {
    try {
      await tracker.init();
      out.appendLine('[init] scan done: ' + tracker.totalFileCount() + ' files, ' + tracker.totalLines() + ' lines');
      if (vscode.window.activeTextEditor) {
        tracker.markExposed(vscode.window.activeTextEditor.document.uri);
      }
      for (const doc of vscode.workspace.textDocuments) {
        tracker.markExposed(doc.uri);
      }

      if (!context.globalState.get<boolean>('aiExposure.welcomed')) {
        await context.globalState.update('aiExposure.welcomed', true);
        const pick = await vscode.window.showInformationMessage(
          'AI Code Exposure Monitor is active. View the dashboard?',
          'Open Dashboard',
          'Not now'
        );
        if (pick === 'Open Dashboard') {
          await vscode.commands.executeCommand('aiExposure.showDashboard');
        }
      }
    } catch (e: unknown) {
      const err = e as Error;
      out.appendLine('[init] ERROR: ' + (err?.stack || err?.message || String(e)));
      void vscode.window.showErrorMessage('AI Code Exposure Monitor failed to initialise. See Output → "AI Code Exposure Monitor".');
    }
  })();

  out.appendLine('[activate] returned (background init running)');
}

export function deactivate() {}
