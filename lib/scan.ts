// Defensive scanning, only on targets YOU authorise in .env.local:
//   web          -> passive website security check (TLS certificate, HTTPS redirect, security headers,
//                   cookie flags, version disclosure, security.txt). A few normal page requests; no attacks.
//   trivy-image  -> Trivy vulnerability/secret scan of a container image (Trivy runs on your computer)
//   trivy-repo   -> Trivy scan of a git repository URL
//   trivy-fs     -> Trivy scan of a folder inside SCAN_ALLOWED_PATHS
// Trivy: https://trivy.dev  (install it locally; Siva calls the CLI and reads its JSON report)
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import tls from 'node:tls';
import type { FindingSeverity, ScanFinding, ScanKind, ScanRecord } from './types';
import { getEnv } from './config';
import { getKevMap } from './sources';
import { updateStore } from './store';
import { geminiJson } from './gemini';
import { SYSTEM_RULES } from './ai';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// ---------- Target validation (pure, tested) ----------

export function normaliseHost(input: string): string | null {
  let s = input.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s)) return null;
  return s;
}

export function hostAllowed(host: string, allowList: string[]): boolean {
  return allowList.some((raw) => {
    const entry = raw.trim().toLowerCase().replace(/^\*\./, '');
    return entry && (host === entry || host.endsWith(`.${entry}`));
  });
}

export function pathAllowed(target: string, allowList: string[]): string | null {
  const resolved = path.resolve(target);
  for (const base of allowList) {
    const root = path.resolve(base);
    const rel = path.relative(root, resolved);
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return resolved;
  }
  return null;
}

export function validateScanTarget(
  kind: unknown,
  target: unknown,
  cfg: { domains: string[]; paths: string[]; repoHosts: string[] },
): Result<{ kind: ScanKind; target: string }> {
  if (typeof target !== 'string' || !target.trim() || target.length > 300) return { ok: false, error: 'Enter a target (max 300 characters).' };
  const t = target.trim();
  switch (kind) {
    case 'web': {
      const host = normaliseHost(t);
      if (!host) return { ok: false, error: 'Enter a valid domain name, for example example.com' };
      if (!cfg.domains.length) return { ok: false, error: 'No domains are authorised yet. Add your own domains to SCAN_ALLOWED_DOMAINS in .env.local and restart.' };
      if (!hostAllowed(host, cfg.domains)) return { ok: false, error: `${host} is not in SCAN_ALLOWED_DOMAINS. Only scan sites you own or are authorised to test.` };
      return { ok: true, value: { kind, target: host } };
    }
    case 'trivy-image':
      if (!/^[a-z0-9][a-z0-9._\-/:@]{0,250}$/i.test(t)) return { ok: false, error: 'Enter an image name such as nginx:1.27 or ghcr.io/org/app:tag' };
      return { ok: true, value: { kind, target: t } };
    case 'trivy-repo': {
      let u: URL;
      try {
        u = new URL(t);
      } catch {
        return { ok: false, error: 'Enter a full https:// repository URL' };
      }
      if (u.protocol !== 'https:' || u.username || u.password) return { ok: false, error: 'Only https:// repository URLs without credentials are allowed' };
      if (!hostAllowed(u.hostname.toLowerCase(), cfg.repoHosts)) return { ok: false, error: `Repository host ${u.hostname} is not in SCAN_ALLOWED_REPO_HOSTS` };
      return { ok: true, value: { kind, target: u.toString() } };
    }
    case 'trivy-fs': {
      if (!cfg.paths.length) return { ok: false, error: 'No folders are authorised yet. Add them to SCAN_ALLOWED_PATHS in .env.local and restart.' };
      const resolved = pathAllowed(t, cfg.paths);
      if (!resolved) return { ok: false, error: 'That folder is not inside SCAN_ALLOWED_PATHS' };
      return { ok: true, value: { kind, target: resolved } };
    }
    default:
      return { ok: false, error: 'Unknown scan type' };
  }
}

// ---------- Web check ----------

export function analyzeHeaders(headers: Record<string, string>, setCookies: string[]): ScanFinding[] {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const f: ScanFinding[] = [];
  const add = (id: string, title: string, severity: FindingSeverity, evidence: string, fix?: string) => f.push({ id, title, severity, evidence, fix });

  const hsts = h['strict-transport-security'];
  const maxAge = Number(/max-age=(\d+)/i.exec(hsts ?? '')?.[1] ?? 0);
  if (!hsts) add('hsts', 'HSTS header missing', 'medium', 'No Strict-Transport-Security header.', 'Add "Strict-Transport-Security: max-age=31536000; includeSubDomains" so browsers always use HTTPS.');
  else if (maxAge < 15_552_000) add('hsts', 'HSTS max-age is short', 'low', `max-age=${maxAge}`, 'Use at least 6 months (15552000), ideally 1 year.');
  else add('hsts', 'HSTS enabled', 'pass', hsts);

  const csp = h['content-security-policy'];
  if (!csp) add('csp', 'Content-Security-Policy missing', 'medium', 'No CSP header.', 'Add a Content-Security-Policy to limit where scripts can load from (reduces cross-site scripting impact).');
  else if (/script-src[^;]*'unsafe-inline'/i.test(csp) || (!/script-src/i.test(csp) && /default-src[^;]*'unsafe-inline'/i.test(csp)))
    add('csp', "CSP allows 'unsafe-inline' scripts", 'low', csp.slice(0, 200), "Remove 'unsafe-inline' from script-src and use nonces or hashes.");
  else add('csp', 'Content-Security-Policy present', 'pass', csp.slice(0, 200));

  if ((h['x-content-type-options'] ?? '').toLowerCase() !== 'nosniff')
    add('xcto', 'X-Content-Type-Options not set to nosniff', 'low', h['x-content-type-options'] ?? 'missing', 'Add "X-Content-Type-Options: nosniff".');
  else add('xcto', 'X-Content-Type-Options: nosniff', 'pass', 'nosniff');

  if (!h['x-frame-options'] && !/frame-ancestors/i.test(csp ?? ''))
    add('framing', 'Clickjacking protection missing', 'medium', 'No X-Frame-Options and no CSP frame-ancestors.', 'Add "X-Frame-Options: DENY" or CSP "frame-ancestors \'none\'".');
  else add('framing', 'Clickjacking protection present', 'pass', h['x-frame-options'] ?? 'CSP frame-ancestors');

  if (!h['referrer-policy']) add('referrer', 'Referrer-Policy missing', 'low', 'missing', 'Add "Referrer-Policy: strict-origin-when-cross-origin".');
  if (!h['permissions-policy']) add('permissions', 'Permissions-Policy missing', 'info', 'missing', 'Optionally add a Permissions-Policy to switch off browser features you do not use.');

  for (const name of ['server', 'x-powered-by', 'x-aspnet-version']) {
    const v = h[name];
    if (v && /\d/.test(v)) add(`disclose-${name}`, `Software version disclosed in ${name} header`, 'low', `${name}: ${v}`, 'Hide version numbers so attackers cannot easily match known vulnerabilities.');
  }

  setCookies.forEach((c, i) => {
    const cname = c.split('=')[0].trim().slice(0, 60);
    const missing = [!/;\s*secure/i.test(c) && 'Secure', !/;\s*httponly/i.test(c) && 'HttpOnly', !/;\s*samesite=/i.test(c) && 'SameSite'].filter(Boolean);
    if (missing.length) add(`cookie-${i}`, `Cookie "${cname}" missing ${missing.join(', ')}`, missing.includes('Secure') ? 'medium' : 'low', `Set-Cookie for ${cname} (value not stored)`, 'Set Secure, HttpOnly (if scripts do not need it) and SameSite on session cookies.');
  });
  return f;
}

export function certFinding(validTo: string | undefined, authorized: boolean, authError: string | null, now = Date.now()): ScanFinding {
  if (!validTo) return { id: 'tls-cert', title: 'Could not read TLS certificate', severity: 'high', evidence: authError ?? 'no certificate' };
  const days = Math.floor((Date.parse(validTo) - now) / 86_400_000);
  if (!authorized) return { id: 'tls-cert', title: 'TLS certificate is not trusted', severity: 'high', evidence: `${authError ?? 'untrusted'}; expires ${validTo}`, fix: 'Install a certificate from a trusted CA (for example Let’s Encrypt) with the full chain.' };
  if (days < 0) return { id: 'tls-cert', title: 'TLS certificate has expired', severity: 'critical', evidence: `Expired ${validTo}`, fix: 'Renew the certificate now.' };
  if (days < 14) return { id: 'tls-cert', title: `TLS certificate expires in ${days} days`, severity: 'high', evidence: validTo, fix: 'Renew soon and automate renewal.' };
  if (days < 30) return { id: 'tls-cert', title: `TLS certificate expires in ${days} days`, severity: 'medium', evidence: validTo, fix: 'Plan renewal; consider automatic renewal.' };
  return { id: 'tls-cert', title: `TLS certificate valid (${days} days left)`, severity: 'pass', evidence: validTo };
}

function tlsInfo(host: string): Promise<{ validTo?: string; authorized: boolean; authError: string | null; protocol: string | null; issuer?: string }> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 10_000 }, () => {
      const cert = socket.getPeerCertificate();
      resolve({
        validTo: cert?.valid_to,
        authorized: socket.authorized,
        authError: socket.authorizationError ? String(socket.authorizationError) : null,
        protocol: socket.getProtocol(),
        issuer: [cert?.issuer?.O ?? cert?.issuer?.CN].flat()[0],
      });
      socket.end();
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ authorized: false, authError: 'TLS connection timed out', protocol: null });
    });
    socket.on('error', (e) => resolve({ authorized: false, authError: e.message, protocol: null }));
  });
}

async function get(url: string) {
  return fetch(url, { redirect: 'manual', headers: { 'user-agent': getEnv().userAgent }, signal: AbortSignal.timeout(15_000) });
}

export async function webCheck(host: string): Promise<ScanFinding[]> {
  const findings: ScanFinding[] = [];
  const t = await tlsInfo(host);
  findings.push(certFinding(t.validTo, t.authorized, t.authError));
  if (t.protocol && /TLSv1(\.[01])?$/.test(t.protocol)) findings.push({ id: 'tls-proto', title: `Old TLS protocol negotiated (${t.protocol})`, severity: 'high', evidence: t.protocol, fix: 'Disable TLS 1.0/1.1; use TLS 1.2+.' });
  else if (t.protocol) findings.push({ id: 'tls-proto', title: `Modern TLS (${t.protocol})`, severity: 'pass', evidence: `${t.protocol}${t.issuer ? `, issuer ${t.issuer}` : ''}` });

  try {
    const res = await get(`http://${host}/`);
    const loc = res.headers.get('location') ?? '';
    if (res.status >= 300 && res.status < 400 && loc.startsWith('https://')) findings.push({ id: 'https-redirect', title: 'HTTP redirects to HTTPS', severity: 'pass', evidence: `${res.status} -> ${loc.slice(0, 120)}` });
    else findings.push({ id: 'https-redirect', title: 'HTTP does not redirect to HTTPS', severity: 'medium', evidence: `http:// returned ${res.status}`, fix: 'Redirect all http:// requests to https:// with a 301.' });
  } catch (err) {
    findings.push({ id: 'https-redirect', title: 'HTTP (port 80) not reachable', severity: 'info', evidence: (err as Error).message });
  }

  // Follow up to 5 redirects on HTTPS, staying on the same site.
  let url = `https://${host}/`;
  let res: Response | null = null;
  for (let i = 0; i < 5; i++) {
    try {
      res = await get(url);
    } catch (err) {
      findings.push({ id: 'https', title: 'HTTPS site not reachable', severity: 'high', evidence: (err as Error).message });
      return findings;
    }
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      const next = new URL(loc, url);
      if (next.protocol !== 'https:' || !(next.hostname === host || next.hostname.endsWith(`.${host}`) || host.endsWith(`.${next.hostname}`))) break;
      url = next.toString();
      continue;
    }
    break;
  }
  if (res) {
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    findings.push(...analyzeHeaders(headers, res.headers.getSetCookie?.() ?? []));
  }

  try {
    const sec = await get(`https://${host}/.well-known/security.txt`);
    const body = sec.status === 200 ? (await sec.text()).slice(0, 5000) : '';
    if (/^\s*contact:/im.test(body)) findings.push({ id: 'security-txt', title: 'security.txt published', severity: 'pass', evidence: '/.well-known/security.txt has a Contact field' });
    else findings.push({ id: 'security-txt', title: 'security.txt missing', severity: 'info', evidence: `HTTP ${sec.status}`, fix: 'Publish /.well-known/security.txt so researchers can report issues (see securitytxt.org).' });
  } catch {
    /* optional check */
  }
  return findings;
}

// ---------- Trivy ----------

const SEV: Record<string, FindingSeverity> = { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low', UNKNOWN: 'info' };

/** Convert a Trivy JSON report into findings. Secrets are reported WITHOUT their values. */
export function parseTrivyReport(json: unknown, kev: Set<string>): ScanFinding[] {
  const results = (json as { Results?: unknown })?.Results;
  if (results !== undefined && !Array.isArray(results)) throw new Error('Unexpected Trivy report format');
  const out: ScanFinding[] = [];
  for (const r of (results ?? []) as Record<string, unknown>[]) {
    const target = String(r.Target ?? '');
    for (const v of (Array.isArray(r.Vulnerabilities) ? r.Vulnerabilities : []) as Record<string, unknown>[]) {
      const id = String(v.VulnerabilityID ?? '');
      const pkg = String(v.PkgName ?? '');
      const fixed = v.FixedVersion ? String(v.FixedVersion) : '';
      out.push({
        id,
        title: `${pkg} ${v.InstalledVersion ?? ''}: ${String(v.Title ?? id).slice(0, 160)}`,
        severity: SEV[String(v.Severity)] ?? 'info',
        evidence: `Installed ${v.InstalledVersion ?? '?'}; ${fixed ? `fixed in ${fixed}` : 'no fixed version yet'} (${target})`,
        fix: fixed ? `Upgrade ${pkg} to ${fixed} or later.` : 'No fix released yet: limit exposure or replace the package.',
        url: typeof v.PrimaryURL === 'string' ? v.PrimaryURL : undefined,
        inKev: kev.has(id),
      });
    }
    for (const s of (Array.isArray(r.Secrets) ? r.Secrets : []) as Record<string, unknown>[]) {
      out.push({
        id: String(s.RuleID ?? 'secret'),
        title: `Exposed secret: ${String(s.Title ?? s.RuleID ?? 'secret')}`,
        severity: SEV[String(s.Severity)] ?? 'high',
        evidence: `${target}${s.StartLine ? ` line ${s.StartLine}` : ''} (value not stored)`,
        fix: 'Remove the secret from the code/image, rotate it, and use a secrets manager.',
      });
    }
    for (const m of (Array.isArray(r.Misconfigurations) ? r.Misconfigurations : []) as Record<string, unknown>[]) {
      if (m.Status && m.Status !== 'FAIL') continue;
      out.push({
        id: String(m.AVDID ?? m.ID ?? 'misconfig'),
        title: `Misconfiguration: ${String(m.Title ?? m.ID)}`,
        severity: SEV[String(m.Severity)] ?? 'info',
        evidence: target,
        fix: typeof m.Resolution === 'string' ? m.Resolution : undefined,
        url: typeof m.PrimaryURL === 'string' ? m.PrimaryURL : undefined,
      });
    }
  }
  const rank: Record<FindingSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4, pass: 5 };
  return out.sort((a, b) => Number(Boolean(b.inKev)) - Number(Boolean(a.inKev)) || rank[a.severity] - rank[b.severity]);
}

export function trivyArgs(kind: ScanKind, target: string, serverUrl: string): string[] {
  const sub = kind === 'trivy-image' ? 'image' : kind === 'trivy-repo' ? 'repo' : 'fs';
  const scanners = kind === 'trivy-image' ? 'vuln,secret' : 'vuln,secret,misconfig';
  return [sub, '--format', 'json', '--quiet', '--timeout', '15m', '--scanners', scanners, ...(serverUrl && kind === 'trivy-image' ? ['--server', serverUrl] : []), target];
}

function runTrivy(kind: ScanKind, target: string): Promise<unknown> {
  const { trivyPath, trivyServerUrl } = getEnv();
  return new Promise((resolve, reject) => {
    execFile(trivyPath, trivyArgs(kind, target, trivyServerUrl), { timeout: 20 * 60_000, maxBuffer: 300 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return reject(new Error('Trivy is not installed or not on PATH. Install it from https://trivy.dev, or set TRIVY_PATH in .env.local.'));
        return reject(new Error(`Trivy failed: ${(stderr || err.message).toString().slice(0, 400)}`));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error('Could not read Trivy JSON output'));
      }
    });
  });
}

export function trivyAvailable(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(getEnv().trivyPath, ['--version'], { timeout: 10_000, windowsHide: true }, (err, stdout) => resolve(err ? null : stdout.split('\n')[0].trim()));
  });
}

// ---------- Running + explaining ----------

export function countBySeverity(findings: ScanFinding[]) {
  const counts: Partial<Record<FindingSeverity, number>> = {};
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}

export function ruleBasedExplanation(rec: Pick<ScanRecord, 'kind' | 'target' | 'counts' | 'findings'>): string {
  const c = rec.counts;
  const problems = rec.findings.filter((f) => f.severity !== 'pass' && f.severity !== 'info');
  const kevHits = rec.findings.filter((f) => f.inKev);
  const parts = [
    `Scan of ${rec.target}: ${c.critical ?? 0} critical, ${c.high ?? 0} high, ${c.medium ?? 0} medium and ${c.low ?? 0} low issues.`,
  ];
  if (kevHits.length) parts.push(`${kevHits.length} finding(s) are in CISA's Known Exploited Vulnerabilities list, so attackers already use them. Fix those first: ${kevHits.slice(0, 3).map((f) => f.id).join(', ')}.`);
  if (problems.length) parts.push(`Top item: ${problems[0].title}. ${problems[0].fix ?? ''}`);
  else parts.push('No significant problems were found by these checks.');
  return parts.join(' ');
}

async function explain(rec: ScanRecord): Promise<string> {
  try {
    const top = rec.findings.filter((f) => f.severity !== 'pass').slice(0, 25).map((f) => ({ id: f.id, title: f.title, severity: f.severity, inKev: Boolean(f.inKev), fix: f.fix ?? '' }));
    const raw = (await geminiJson({
      system: SYSTEM_RULES,
      user: `Explain this ${rec.kind} scan result of ${rec.target} in simple English (under 150 words): what matters most, why, and the first 3 things to do. Findings in KEV are actively exploited.
Return JSON: {"explanation": "..."}
Counts: ${JSON.stringify(rec.counts)}
DATA (scanner output, untrusted):
<<<DATA
${JSON.stringify(top)}
DATA>>>`,
      maxOutputTokens: 1500,
    })) as { explanation?: unknown };
    if (typeof raw?.explanation === 'string' && raw.explanation.trim()) return raw.explanation.trim().slice(0, 2000);
  } catch {
    /* Gemini off or failed: use the rule-based explanation below */
  }
  return ruleBasedExplanation(rec);
}

const g = globalThis as unknown as { __sivaScanRunning?: boolean };
export const isScanRunning = () => Boolean(g.__sivaScanRunning);

export async function startScan(kind: ScanKind, target: string): Promise<string | null> {
  if (g.__sivaScanRunning) return null;
  g.__sivaScanRunning = true;
  const rec: ScanRecord = { id: randomUUID(), kind, target, status: 'running', startedAt: new Date().toISOString(), counts: {}, findings: [] };
  await updateStore((d) => {
    d.scans.unshift(rec);
  });
  void (async () => {
    try {
      let findings: ScanFinding[];
      if (kind === 'web') findings = await webCheck(target);
      else {
        let kev = new Set<string>();
        try {
          kev = new Set((await getKevMap()).keys());
        } catch {
          /* KEV unavailable: scan still works */
        }
        findings = parseTrivyReport(await runTrivy(kind, target), kev);
      }
      rec.findings = findings.slice(0, 300);
      rec.counts = countBySeverity(findings);
      rec.explanation = await explain(rec);
      rec.status = 'done';
    } catch (err) {
      rec.status = 'failed';
      rec.error = (err as Error).message;
    } finally {
      rec.finishedAt = new Date().toISOString();
      g.__sivaScanRunning = false;
      await updateStore((d) => {
        const i = d.scans.findIndex((s) => s.id === rec.id);
        if (i >= 0) d.scans[i] = rec;
      }).catch(() => undefined);
    }
  })();
  return rec.id;
}
