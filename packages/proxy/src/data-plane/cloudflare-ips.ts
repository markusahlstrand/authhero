/**
 * Cloudflare's published edge ranges, used to recognize when
 * `CF-Connecting-IP` carries Cloudflare's own address rather than a visitor's.
 * That happens whenever the proxy is reached worker-to-worker: the inner
 * Worker sees the loopback source (e.g. `2a06:98c0:3600::103`) instead of the
 * client, and stamping it into the forwarded headers would launder it as a
 * real client IP.
 *
 * Source: https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6
 * (list is stable; refresh if Cloudflare publishes new ranges).
 */
const CLOUDFLARE_CIDRS = [
  // IPv4
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  // IPv6
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

function parseIpv4(text: string): number[] | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    bytes.push(value);
  }
  return bytes;
}

function expandIpv6Groups(part: string): number[] | null {
  if (part === "") return [];
  const chunks = part.split(":");
  const groups: number[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (chunk.includes(".")) {
      // An embedded IPv4 literal is only legal as the trailing 32 bits.
      if (i !== chunks.length - 1) return null;
      const v4 = parseIpv4(chunk);
      if (!v4) return null;
      groups.push((v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!);
      continue;
    }
    if (!/^[0-9a-f]{1,4}$/i.test(chunk)) return null;
    groups.push(parseInt(chunk, 16));
  }
  return groups;
}

function parseIpv6(text: string): number[] | null {
  const halves = text.split("::");
  if (halves.length > 2) return null;

  const head = expandIpv6Groups(halves[0] ?? "");
  if (!head) return null;

  let groups: number[];
  if (halves.length === 2) {
    const tail = expandIpv6Groups(halves[1] ?? "");
    if (!tail) return null;
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
    groups = [...head, ...new Array<number>(fill).fill(0), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const group of groups) bytes.push((group >> 8) & 0xff, group & 0xff);
  return bytes;
}

/**
 * Parse a textual IP address into its bytes: 4 for IPv4, 16 for IPv6.
 * IPv4-mapped IPv6 (`::ffff:1.2.3.4`) collapses to the 4-byte form so it is
 * matched against the IPv4 ranges. Returns null for anything unparseable.
 */
export function parseIpAddress(input: string): number[] | null {
  let text = input.trim();
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  // Strip an IPv6 zone id (`fe80::1%eth0`) — never present on CF-Connecting-IP
  // but cheap to tolerate.
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);
  if (text === "") return null;

  if (!text.includes(":")) return parseIpv4(text);

  const bytes = parseIpv6(text);
  if (!bytes) return null;

  const isV4Mapped =
    bytes.slice(0, 10).every((b) => b === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff;
  return isV4Mapped ? bytes.slice(12) : bytes;
}

interface ParsedCidr {
  bytes: number[];
  prefixBits: number;
}

function parseCidr(cidr: string): ParsedCidr {
  const [address, prefix] = cidr.split("/");
  const bytes = parseIpAddress(address ?? "");
  const prefixBits = Number(prefix);
  if (!bytes || !Number.isInteger(prefixBits)) {
    throw new Error(`Invalid Cloudflare CIDR: ${cidr}`);
  }
  return { bytes, prefixBits };
}

const PARSED_CLOUDFLARE_CIDRS: ParsedCidr[] = CLOUDFLARE_CIDRS.map(parseCidr);

function inCidr(addr: number[], cidr: ParsedCidr): boolean {
  if (addr.length !== cidr.bytes.length) return false;
  const fullBytes = cidr.prefixBits >> 3;
  for (let i = 0; i < fullBytes; i++) {
    if (addr[i] !== cidr.bytes[i]) return false;
  }
  const remainingBits = cidr.prefixBits & 7;
  if (remainingBits === 0) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (addr[fullBytes]! & mask) === (cidr.bytes[fullBytes]! & mask);
}

/**
 * True when `ip` falls inside a Cloudflare-published range. Unparseable input
 * returns false — callers treat "not recognizably Cloudflare" as a client IP.
 */
export function isCloudflareIp(ip: string): boolean {
  const addr = parseIpAddress(ip);
  if (!addr) return false;
  return PARSED_CLOUDFLARE_CIDRS.some((cidr) => inCidr(addr, cidr));
}
