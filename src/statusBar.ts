import * as vscode from 'vscode';
import { ExposureTracker } from './exposureTracker';

export function createStatusBar(tracker: ExposureTracker): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10000);
  item.command = 'aiExposure.showDashboard';
  item.name = 'AI Code Exposure';

  const render = () => {
    const total = tracker.totalLines();
    if (total === 0) {
      item.text = '$(eye) AI exposure: scanning…';
      item.color = undefined;
      item.tooltip = new vscode.MarkdownString('Indexing workspace files — click for dashboard.');
    } else {
      const pct = tracker.percent();
      item.text = `$(eye) AI exposure: ${pct.toFixed(1)}%`;
      item.color = pct >= 50 ? '#f44747' : pct >= 25 ? '#e8731a' : '#000';
      const sensitive = tracker.sensitiveExposedCount();
      item.tooltip = new vscode.MarkdownString(
        `**AI code exposure**\n\n` +
        `- Exposed lines: ${tracker.exposedLines().toLocaleString()} / ${total.toLocaleString()}\n` +
        `- Exposed files: ${tracker.exposedFileCount()} / ${tracker.totalFileCount()}\n` +
        `- ⚠ Sensitive exposed: ${sensitive}\n\n` +
        `Click for dashboard.`
      );
    }
    item.show();
  };

  render();
  const sub = tracker.onChange(render);
  return vscode.Disposable.from(item, sub);
}
