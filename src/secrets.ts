import * as path from 'path';

export type RiskCategory = 'secret' | 'credential' | 'pii';

export interface RiskFinding {
  pattern: string;
  source: 'path' | 'content';
  category: RiskCategory;
}

export type RiskLevel = 'safe' | 'high';

export interface RiskResult {
  level: RiskLevel;
  findings: RiskFinding[];
}

/** A single concrete match located in text, with character-offset range. */
export interface RiskMatch {
  pattern: string;
  category: RiskCategory;
  start: number; // 0-based char offset (inclusive)
  end: number;   // 0-based char offset (exclusive)
}

const PATH_PATTERNS: { re: RegExp; label: string; category: RiskCategory }[] = [
  { re: /(^|[\\/])\.env(\.[^\\/]+)?$/i,                     label: '.env file',                category: 'credential' },
  { re: /(^|[\\/])secrets?([\\/]|\.|$)/i,                   label: 'secrets path',             category: 'secret' },
  { re: /(^|[\\/])credentials?(\.[^\\/]+)?$/i,              label: 'credentials file',         category: 'credential' },
  { re: /(^|[\\/])id_(rsa|ed25519|ecdsa|dsa)(\.[^\\/]+)?$/i, label: 'SSH private key',         category: 'secret' },
  { re: /\.(pem|key|p12|pfx|asc|gpg|jks|keystore)$/i,       label: 'private key / cert',       category: 'secret' },
  { re: /(^|[\\/])\.aws[\\/]credentials$/i,                 label: 'AWS credentials',          category: 'credential' },
  { re: /(^|[\\/])\.netrc$/i,                               label: '.netrc',                   category: 'credential' },
  { re: /(^|[\\/])\.npmrc$/i,                               label: '.npmrc (may contain tokens)', category: 'secret' },
  { re: /(^|[\\/])serviceAccount\w*\.json$/i,               label: 'GCP service account',      category: 'secret' },
  { re: /(^|[\\/])kubeconfig$/i,                            label: 'kubeconfig',               category: 'credential' },
];

const CONTENT_PATTERNS: { re: RegExp; label: string; category: RiskCategory }[] = [
  // --- Cryptographic / API keys (SECRET) ---
  { re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,            label: 'private key block',          category: 'secret' },
  { re: /AKIA[0-9A-Z]{16}/,                                                 label: 'AWS access key',              category: 'secret' },
  { re: /aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{30,}/i,                 label: 'AWS secret',                  category: 'secret' },
  { re: /\bxox[abp]-[A-Za-z0-9-]{10,}/,                                     label: 'Slack token',                 category: 'secret' },
  { re: /\bghp_[A-Za-z0-9]{36,}/,                                           label: 'GitHub PAT',                  category: 'secret' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}/,                                   label: 'GitHub fine-grained PAT',     category: 'secret' },
  { re: /\bsk-(?:proj-|ant-|live_)?[A-Za-z0-9_-]{20,}/,                     label: 'OpenAI/Anthropic key',        category: 'secret' },
  { re: /\bAIza[0-9A-Za-z_-]{30,}/,                                         label: 'Google API key',              category: 'secret' },
  { re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/,                     label: 'SendGrid key',                category: 'secret' },
  { re: /JDBC_URL\s*=\s*['"]?jdbc:[^'"\s]+:\/\/[^'"\s]*:[^@'"\s]+@/i,       label: 'JDBC URL with password',      category: 'secret' },
  { re: /mongodb(?:\+srv)?:\/\/[^:\/]+:[^@\/]+@/i,                          label: 'MongoDB URL with password',   category: 'secret' },
  { re: /postgres(?:ql)?:\/\/[^:\/]+:[^@\/]+@/i,                            label: 'Postgres URL with password',  category: 'secret' },
  { re: /(?:api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"][^'"]{12,}['"]/i, label: 'inline API key/secret', category: 'secret' },

  // --- Credentials / passwords (CREDENTIAL = "PASS") ---
  { re: /(?:password|passwd|pwd|passphrase)\s*[:=]\s*['"][^'"\s]{4,}['"]/i, label: 'hardcoded password',          category: 'credential' },
  { re: /(?:username|user|login|userid)\s*[:=]\s*['"][^'"@\s]{3,}['"]/i,     label: 'hardcoded username',          category: 'credential' },
  { re: /Bearer\s+[A-Za-z0-9_\-\.=]{20,}/i,                                 label: 'bearer token',                category: 'credential' },
  { re: /Basic\s+[A-Za-z0-9+\/]{16,}={0,2}/i,                               label: 'basic auth header',           category: 'credential' },

  // --- PII / personal data ---
  { re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/,             label: 'email address',               category: 'pii' },
  { re: /\b\d{3}-\d{2}-\d{4}\b/,                                            label: 'US SSN',                      category: 'pii' },
  { re: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/, label: 'credit card number', category: 'pii' },
  { re: /\b\+?(?:\d[\s\-]?){9,14}\d\b/,                                     label: 'phone number',                category: 'pii' },
  { re: /\bdob\s*[:=]\s*['"]?\d{4}-\d{2}-\d{2}['"]?/i,                      label: 'date of birth',               category: 'pii' },
  { re: /\biban\s*[:=]\s*['"]?[A-Z]{2}\d{2}[A-Z0-9]{10,30}['"]?/i,          label: 'IBAN',                        category: 'pii' },
];

const MAX_CONTENT_SCAN_BYTES = 256 * 1024; // 256 KB cap

export function scanRiskByPath(fsPath: string): RiskFinding[] {
  const out: RiskFinding[] = [];
  for (const p of PATH_PATTERNS) {
    if (p.re.test(fsPath)) out.push({ pattern: p.label, source: 'path', category: p.category });
  }
  return out;
}

export function scanRiskByContent(data: Uint8Array): RiskFinding[] {
  if (data.length === 0) return [];
  const slice = data.length > MAX_CONTENT_SCAN_BYTES ? data.slice(0, MAX_CONTENT_SCAN_BYTES) : data;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
  } catch {
    return [];
  }
  const out: RiskFinding[] = [];
  for (const p of CONTENT_PATTERNS) {
    if (p.re.test(text)) out.push({ pattern: p.label, source: 'content', category: p.category });
  }
  return out;
}

/**
 * Locate every concrete content-pattern match in `text`, returning character-offset
 * ranges suitable for editor decorations. Unlike scanRiskByContent (presence-only),
 * this finds ALL occurrences of each pattern so each can be highlighted individually.
 */
export function scanRiskMatches(text: string): RiskMatch[] {
  if (text.length === 0) return [];
  const scan = text.length > MAX_CONTENT_SCAN_BYTES ? text.slice(0, MAX_CONTENT_SCAN_BYTES) : text;
  const out: RiskMatch[] = [];
  for (const p of CONTENT_PATTERNS) {
    const flags = p.re.flags.includes('g') ? p.re.flags : p.re.flags + 'g';
    const re = new RegExp(p.re.source, flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(scan)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      out.push({ pattern: p.label, category: p.category, start: m.index, end: m.index + m[0].length });
      if (out.length > 5000) return out; // safety cap on pathological inputs
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function combineRisk(findings: RiskFinding[]): RiskResult {
  return { level: findings.length > 0 ? 'high' : 'safe', findings };
}

export function basename(fsPath: string): string {
  return path.basename(fsPath);
}
