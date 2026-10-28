// Keeps server-side fetches of untrusted URLs (custom feeds, feed-advertised links, article links)
// on the public internet. Blocks loopback, private, link-local (cloud metadata) and similar ranges.
import { lookup } from 'node:dns/promises';
import net from 'node:net';

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

/** True for loopback/private/link-local addresses and for names that are clearly local. */
export function isPrivateHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  const kind = net.isIP(h);
  if (kind === 4) return ipv4Private(h);
  if (kind === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
    if (mapped) return ipv4Private(mapped[1]);
    return h === '::' || h === '::1' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('ff');
  }
  return false;
}

/** Throws unless the URL is http(s) and its host (including every DNS answer) is public. */
export async function assertPublicUrl(url: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Only http(s) URLs are allowed');
  if (isPrivateHost(u.hostname)) throw new Error(`Blocked: ${u.hostname} is not a public address`);
  if (net.isIP(u.hostname.replace(/^\[|\]$/g, ''))) return;
  let answers: { address: string }[];
  try {
    answers = await lookup(u.hostname, { all: true });
  } catch {
    return; // unresolvable: the fetch itself will fail with a normal network error
  }
  if (answers.some((a) => isPrivateHost(a.address))) throw new Error(`Blocked: ${u.hostname} resolves to a private address`);
}
