import * as path from 'path';

export interface RiskFinding {
  pattern: string;
  source: 'path' | 'content';
}

export type RiskLevel = 'safe' | 'high';

export interface RiskResult {
  level: RiskLevel;
  findings: RiskFinding[];
}

const PATH_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /(^|[\\/])\.env(\.[^\\/]+)?$/i,                     label: '.env file' },
  { re: /(^|[\\/])secrets?([\\/]|\.|$)/i,                   label: 'secrets path' },
  { re: /(^|[\\/])credentials?(\.[^\\/]+)?$/i,              label: 'credentials file' },
  { re: /(^|[\\/])id_(rsa|ed25519|ecdsa|dsa)(\.[^\\/]+)?$/i, label: 'SSH private key' },
  { re: /\.(pem|key|p12|pfx|asc|gpg|jks|keystore)$/i,       label: 'private key / cert' },
  { re: /(^|[\\/])\.aws[\\/]credentials$/i,                 label: 'AWS credentials' },
  { re: /(^|[\\/])\.netrc$/i,                               label: '.netrc' },
  { re: /(^|[\\/])\.npmrc$/i,                               label: '.npmrc (may contain tokens)' },
  { re: /(^|[\\/])serviceAccount\w*\.json$/i,               label: 'GCP service account' },
  { re: /(^|[\\/])kubeconfig$/i,                            label: 'kubeconfig' },
];

const CONTENT_PATTERNS: { re: RegExp; label: string }[] = [
  // --- Cryptographic / API keys ---
  { re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,            label: 'private key block' },
  { re: /AKIA[0-9A-Z]{16}/,                                                 label: 'AWS access key' },
  { re: /aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{30,}/i,                 label: 'AWS secret' },
  { re: /\bxox[abp]-[A-Za-z0-9-]{10,}/,                                     label: 'Slack token' },
  { re: /\bghp_[A-Za-z0-9]{36,}/,                                           label: 'GitHub PAT' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}/,                                   label: 'GitHub fine-grained PAT' },
  { re: /\bsk-(?:proj-|ant-|live_)?[A-Za-z0-9_-]{20,}/,                     label: 'OpenAI/Anthropic key' },
  { re: /\bAIza[0-9A-Za-z_-]{30,}/,                                         label: 'Google API key' },
  { re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/,                     label: 'SendGrid key' },
  { re: /JDBC_URL\s*=\s*['"]?jdbc:[^'"\s]+:\/\/[^'"\s]*:[^@'"\s]+@/i,       label: 'JDBC URL with password' },
  { re: /mongodb(?:\+srv)?:\/\/[^:\/]+:[^@\/]+@/i,                          label: 'MongoDB URL with password' },
  { re: /postgres(?:ql)?:\/\/[^:\/]+:[^@\/]+@/i,                            label: 'Postgres URL with password' },

  // --- Credentials in source ---
  { re: /(?:api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token)\s*[:=]\s*['"][^'"]{12,}['"]/i, label: 'inline API key/secret' },
  { re: /(?:password|passwd|pwd|passphrase)\s*[:=]\s*['"][^'"\s]{4,}['"]/i, label: 'hardcoded password' },
  { re: /(?:username|user|login|userid)\s*[:=]\s*['"][^'"@\s]{3,}['"]/i,     label: 'hardcoded username' },
  { re: /Bearer\s+[A-Za-z0-9_\-\.=]{20,}/i,                                 label: 'bearer token' },
  { re: /Basic\s+[A-Za-z0-9+\/]{16,}={0,2}/i,                               label: 'basic auth header' },

  // --- PII / personal data ---
  { re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/,             label: 'email address' },
  { re: /\b\d{3}-\d{2}-\d{4}\b/,                                            label: 'US SSN' },
  { re: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/, label: 'credit card number' },
  { re: /\b\+?(?:\d[\s\-]?){9,14}\d\b/,                                     label: 'phone number' },
  { re: /\bdob\s*[:=]\s*['"]?\d{4}-\d{2}-\d{2}['"]?/i,                      label: 'date of birth' },
  { re: /\biban\s*[:=]\s*['"]?[A-Z]{2}\d{2}[A-Z0-9]{10,30}['"]?/i,          label: 'IBAN' },
];

const MAX_CONTENT_SCAN_BYTES = 256 * 1024; // 256 KB cap

export function scanRiskByPath(fsPath: string): RiskFinding[] {
  const out: RiskFinding[] = [];
  for (const p of PATH_PATTERNS) {
    if (p.re.test(fsPath)) out.push({ pattern: p.label, source: 'path' });
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
    if (p.re.test(text)) out.push({ pattern: p.label, source: 'content' });
  }
  return out;
}

export function combineRisk(findings: RiskFinding[]): RiskResult {
  return { level: findings.length > 0 ? 'high' : 'safe', findings };
}

export function basename(fsPath: string): string {
  return path.basename(fsPath);
}
