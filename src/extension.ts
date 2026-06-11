import * as vscode from 'vscode';
import * as path from 'path';
import { ExposureTracker } from './exposureTracker';
import { createStatusBar } from './statusBar';
import { showDashboard } from './dashboard';
import { CurrentProjectViewProvider } from './currentProjectView';
import { installThresholdAd } from './ad';
import { installSensitiveDecorations } from './decorations';

const out = vscode.window.createOutputChannel('AI Code Exposure Monitor');

const ALERT_SUPPRESS_KEY = 'aiExposure.sensitiveAlertSuppressed';

function isPsdeOn(): boolean {
  return !!vscode.workspace.getConfiguration('aiExposure').get<boolean>('proactiveProtection.enabled', false);
}

/**
 * Paths the user deliberately opened from the sensitive-file review picker.
 * Opening from review is inspection, not real AI exposure, so PSDE should not
 * pop its pre-flight modal for these. Entries auto-expire after the open settles.
 */
const reviewOpenBypass = new Set<string>();
function bypassPsdeForReviewOpen(fsPath: string): void {
  reviewOpenBypass.add(fsPath);
  setTimeout(() => reviewOpenBypass.delete(fsPath), 1500);
}

/**
 * PSDE pre-flight: if PSDE is on and the file is sensitive (and not already flagged
 * as test data), ask the user before counting it as exposed. Returns true if the
 * caller should proceed with marking the file as exposed; false if the file was
 * closed / marked test data and should be skipped.
 */
async function psdePreflight(tracker: ExposureTracker, uri: vscode.Uri): Promise<boolean> {
  if (!isPsdeOn()) return true;
  if (uri.scheme !== 'file') return true;
  const fsPath = uri.fsPath;
  if (reviewOpenBypass.has(fsPath)) return true; // opened from review picker — inspection, not exposure
  if (!tracker.isSensitive(fsPath)) return true;

  const risk = tracker.getRiskFor(fsPath) || [];
  const fname = path.basename(fsPath);
  const labels = risk.map((r) => r.pattern);

  const pick = await vscode.window.showWarningMessage(
    `🛡 PSDE: ${fname} is protected — about to expose it to AI?`,
    {
      modal: true,
      detail:
        `Findings (${labels.length}):\n• ${labels.join('\n• ')}\n\n` +
        `Proactive Sensitive Data Exposure (PSDE) blocked this file from being silently exposed ` +
        `to AI assistants. Choose:\n\n` +
        `  • Expose anyway — file content becomes visible to active AI tools.\n` +
        `  • Mark as test data — never asks again, excluded from sensitive counts.\n` +
        `  • Close file — abort. AI never sees content.`,
    },
    'Expose anyway',
    'Mark as test data',
    'Close file',
  );
  if (pick === 'Expose anyway') return true;
  if (pick === 'Mark as test data') {
    await tracker.markAsTestData(fsPath);
    return true;
  }
  // Close file (or undefined) → revert + close active editor
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  return false;
}

/**
 * Shared sensitive-file picker: multi-select (to mark test data) with a per-row
 * "Open" button that reveals the file in an editor so the user can inspect the
 * actual findings (which the decorations module then highlights) before deciding.
 */
function pickSensitiveFiles<T extends vscode.QuickPickItem & { file: string }>(
  items: T[],
  title: string,
  placeHolder: string,
): Promise<T[] | undefined> {
  const openButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('go-to-file'),
    tooltip: 'Open file (without closing this review)',
  };
  const qp = vscode.window.createQuickPick<T>();
  qp.items = items.map((it) => ({ ...it, buttons: [openButton] }));
  qp.canSelectMany = true;
  qp.title = title;
  qp.placeholder = placeHolder;
  qp.ignoreFocusOut = true;

  return new Promise<T[] | undefined>((resolve) => {
    let accepted = false;
    qp.onDidTriggerItemButton((e) => {
      bypassPsdeForReviewOpen(e.item.file);
      void vscode.window.showTextDocument(vscode.Uri.file(e.item.file), { preview: true, preserveFocus: true });
    });
    qp.onDidAccept(() => {
      accepted = true;
      resolve([...qp.selectedItems]);
      qp.hide();
    });
    qp.onDidHide(() => {
      if (!accepted) resolve(undefined);
      qp.dispose();
    });
    qp.show();
  });
}

async function psdeReviewByCategory(tracker: ExposureTracker, category: 'secret' | 'credential' | 'pii'): Promise<void> {
  const list = tracker.sensitiveFilesByCategory(category);
  if (list.length === 0) {
    void vscode.window.showInformationMessage(`No exposed files contain ${category === 'credential' ? 'passwords / credentials' : category} (or all marked as test data).`);
    return;
  }
  type Item = vscode.QuickPickItem & { file: string };
  const items: Item[] = list.map((f) => {
    const catRisks = f.risk.filter((r) => r.category === category).map((r) => r.pattern);
    const top = catRisks.slice(0, 3).join(', ');
    return {
      label: `$(warning) ${path.basename(f.path)}`,
      description: top + (catRisks.length > 3 ? ` (+${catRisks.length - 3})` : ''),
      detail: f.path,
      file: f.path,
    };
  });
  const title = category === 'secret' ? 'SECRETS exposed'
              : category === 'credential' ? 'PASS / CREDENTIALS exposed'
              : 'PII exposed';
  const picked = await pickSensitiveFiles(
    items,
    `${title}: ${list.length} file(s) — select files that are TEST DATA (excluded from sensitive counts)`,
    'Space to toggle · click the file icon to open · Enter to confirm · Esc to cancel.',
  );
  if (!picked) return;
  for (const p of picked) await tracker.markAsTestData(p.file);
  void vscode.window.showInformationMessage(
    `Marked ${picked.length} ${category} file(s) as test data. ${list.length - picked.length} remain flagged.`
  );
}

async function psdeReview(tracker: ExposureTracker): Promise<void> {
  const list = tracker.sensitiveFilesAll();
  if (list.length === 0) {
    void vscode.window.showInformationMessage('PSDE review: no sensitive files detected in workspace.');
    return;
  }
  type Item = vscode.QuickPickItem & { file: string };
  const items: Item[] = list.map((f) => ({
    label: `$(warning) ${path.basename(f.path)}`,
    description: f.risk.map((r) => r.pattern).slice(0, 3).join(', ') + (f.risk.length > 3 ? ` (+${f.risk.length - 3})` : ''),
    detail: f.path,
    file: f.path,
  }));
  const picked = await pickSensitiveFiles(
    items,
    `PSDE: ${list.length} sensitive file(s) detected — select ones that are TEST DATA (excluded from sensitive counts)`,
    'Space to toggle · click the file icon to open · Enter to confirm · unselected files remain PROTECTED.',
  );
  if (!picked) return;
  for (const p of picked) await tracker.markAsTestData(p.file);
  void vscode.window.showInformationMessage(
    `PSDE: ${picked.length} file(s) marked as test data. ${list.length - picked.length} file(s) remain PROTECTED.`
  );
}

function installSensitiveAlert(context: vscode.ExtensionContext, tracker: ExposureTracker): vscode.Disposable {
  const alertedPaths = new Set<string>();
  return tracker.onActivity(async (ev) => {
    if (ev.type !== 'exposed' || !ev.risk || ev.risk.length === 0 || !ev.path) return;
    const cfg = vscode.workspace.getConfiguration('aiExposure');
    if (!cfg.get<boolean>('sensitiveAlert.enabled', true)) return;
    if (context.globalState.get<boolean>(ALERT_SUPPRESS_KEY, false)) return;
    if (tracker.isTestData(ev.path)) return;
    if (alertedPaths.has(ev.path)) return;
    alertedPaths.add(ev.path);
    const modal = cfg.get<boolean>('sensitiveAlert.modal', true);
    const fname = ev.rel || ev.path;
    const top = ev.risk.slice(0, 3).join(', ');
    const more = ev.risk.length > 3 ? ` (+${ev.risk.length - 3} more)` : '';
    const detail =
      `Risk findings (${ev.risk.length}):\n• ${ev.risk.join('\n• ')}\n\n` +
      `This file has been opened in your editor and may be visible to any AI assistant running ` +
      `(Copilot, Claude, Cursor, Continue, Gemini, etc.). If this is real data — rotate the secret ` +
      `and reset the session. If this is test fixtures or sample data — mark it as test data ` +
      `and it will be excluded from sensitive counts (permanently, remembered across restarts).`;
    const summary = `⚠ Sensitive file exposed to AI tools: ${fname} — ${top}${more}`;
    const opts: vscode.MessageOptions = modal ? { modal: true, detail } : {};

    const CTA_TEST    = 'Mark as test data';
    const CTA_RESET   = 'Reset session';
    const CTA_DISMISS = 'Dismiss';
    const CTA_NEVER   = "Don't show again";

    const pick = await vscode.window.showWarningMessage(
      summary,
      opts,
      CTA_TEST,
      CTA_RESET,
      CTA_DISMISS,
      CTA_NEVER,
    );
    if (pick === CTA_TEST) {
      await tracker.markAsTestData(ev.path);
      void vscode.window.showInformationMessage(
        `${fname} marked as test data. It will no longer count as a sensitive exposure.`,
        'Undo'
      ).then((u) => { if (u === 'Undo') void tracker.unmarkTestData(ev.path!); });
    } else if (pick === CTA_RESET) {
      await vscode.commands.executeCommand('aiExposure.resetCurrent');
    } else if (pick === CTA_NEVER) {
      await context.globalState.update(ALERT_SUPPRESS_KEY, true);
    }
    // CTA_DISMISS or undefined: just close (alertedPaths already added so won't re-show this session)
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
  context.subscriptions.push(installSensitiveDecorations(tracker));

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
    }),
    vscode.commands.registerCommand('aiExposure.markCurrentAsTestData', async () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed || ed.document.uri.scheme !== 'file') {
        void vscode.window.showWarningMessage('Open a file first to mark it as test data.');
        return;
      }
      await tracker.markAsTestData(ed.document.uri.fsPath);
      void vscode.window.showInformationMessage(`Marked ${ed.document.uri.fsPath} as test data.`);
    }),
    vscode.commands.registerCommand('aiExposure.unmarkCurrentAsTestData', async () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed || ed.document.uri.scheme !== 'file') return;
      await tracker.unmarkTestData(ed.document.uri.fsPath);
      void vscode.window.showInformationMessage(`Removed test-data flag from ${ed.document.uri.fsPath}.`);
    }),
    vscode.commands.registerCommand('aiExposure.toggleProactiveProtection', async () => {
      const cfg = vscode.workspace.getConfiguration('aiExposure');
      const next = !cfg.get<boolean>('proactiveProtection.enabled', false);
      await cfg.update('proactiveProtection.enabled', next, vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage(`PSDE ${next ? 'enabled' : 'disabled'}.`);
      if (next) void psdeReview(tracker);
    }),
    vscode.commands.registerCommand('aiExposure.openSensitive', async (p: string) => {
      if (typeof p !== 'string') return;
      bypassPsdeForReviewOpen(p); // dashboard inspection — don't trigger PSDE pre-flight
      await vscode.window.showTextDocument(vscode.Uri.file(p), { preview: true });
    }),
    vscode.commands.registerCommand('aiExposure.reviewSensitive', () => psdeReview(tracker)),
    vscode.commands.registerCommand('aiExposure.reviewSensitiveByCategory', (cat: 'secret' | 'credential' | 'pii') => psdeReviewByCategory(tracker, cat)),
    vscode.commands.registerCommand('aiExposure.clearTestData', async () => {
      const list = tracker.testDataList();
      if (list.length === 0) {
        void vscode.window.showInformationMessage('No files are currently marked as test data.');
        return;
      }
      const pick = await vscode.window.showWarningMessage(
        `Clear test-data flag for ${list.length} file(s)? They will be re-counted as sensitive if their content matches.`,
        { modal: true },
        'Clear all'
      );
      if (pick === 'Clear all') {
        await tracker.clearTestData();
        void vscode.window.showInformationMessage('Test-data flags cleared.');
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (ed) => {
      if (!ed?.document) return;
      if (!(await psdePreflight(tracker, ed.document.uri))) return;
      tracker.markExposed(ed.document.uri);
    }),
    vscode.workspace.onDidOpenTextDocument(async (doc) => {
      if (!(await psdePreflight(tracker, doc.uri))) return;
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
      const ae = vscode.window.activeTextEditor;
      if (ae && (await psdePreflight(tracker, ae.document.uri))) {
        tracker.markExposed(ae.document.uri);
      }
      for (const doc of vscode.workspace.textDocuments) {
        if (await psdePreflight(tracker, doc.uri)) {
          tracker.markExposed(doc.uri);
        }
      }
      // PSDE auto-review: if proactive protection is on and prescan found sensitive files,
      // open the bulk-review picker.
      if (isPsdeOn()
        && vscode.workspace.getConfiguration('aiExposure').get<boolean>('proactiveProtection.reviewAfterScan', true)
        && tracker.sensitiveFilesAll().length > 0) {
        void psdeReview(tracker);
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
