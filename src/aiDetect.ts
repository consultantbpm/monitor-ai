import * as vscode from 'vscode';

interface AiExt {
  id: string;
  name: string;
}

const AI_EXTENSIONS: AiExt[] = [
  { id: 'GitHub.copilot',                 name: 'Copilot' },
  { id: 'GitHub.copilot-chat',            name: 'Copilot Chat' },
  { id: 'Anthropic.claude-code',          name: 'Claude Code' },
  { id: 'Continue.continue',              name: 'Continue' },
  { id: 'Codeium.codeium',                name: 'Codeium' },
  { id: 'TabNine.tabnine-vscode',         name: 'Tabnine' },
  { id: 'google.geminicodeassist',        name: 'Gemini' },
  { id: 'Blackboxapp.blackboxagent',      name: 'Blackbox' },
  { id: 'humansoftware.pando-extension',  name: 'pandō' },
  { id: 'saoudrizwan.claude-dev',         name: 'Cline' },
  { id: 'rooveterinaryinc.roo-cline',     name: 'Roo Code' },
  { id: 'sourcegraph.cody-ai',            name: 'Cody' },
  { id: 'aiXcoder.aixcoder',              name: 'aiXcoder' },
  { id: 'AmazonWebServices.aws-toolkit-vscode', name: 'Amazon Q' },
];

export interface AiPresence {
  /** Display name of the host IDE (e.g. "Visual Studio Code", "Cursor", "Windsurf"). */
  host: string;
  /** True if running in a fork with native AI (Cursor / Windsurf). */
  nativeAi: boolean;
  /** Names of AI extensions currently installed. */
  extensions: string[];
}

export function detectAi(): AiPresence {
  const host = vscode.env.appName || 'VS Code';
  const lowerHost = host.toLowerCase();
  const nativeAi = lowerHost.includes('cursor') || lowerHost.includes('windsurf') || lowerHost.includes('trae');
  const extensions = AI_EXTENSIONS
    .filter((e) => !!vscode.extensions.getExtension(e.id))
    .map((e) => e.name);
  return { host, nativeAi, extensions };
}

export function summaryLine(p: AiPresence): string {
  const parts: string[] = [];
  if (p.nativeAi) parts.push(p.host);
  parts.push(...p.extensions);
  if (parts.length === 0) return 'No AI assistants detected';
  return parts.join(', ');
}
