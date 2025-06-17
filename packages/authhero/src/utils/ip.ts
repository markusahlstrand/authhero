function stripBracketsAndZone(ip: string): string {
  let s = ip.trim();
  if (s.startsWith("[") && s.endsWith("]")) {
    s = s.slice(1, -1);
  }
  const percentIdx = s.indexOf("%");
  if (percentIdx !== -1) s = s.slice(0, percentIdx);
  return s;
}

export function isIPv4(ip: string): boolean {
  const s = stripBracketsAndZone(ip);
  const parts = s.split(".");
  if (parts.length !== 4) return false;
  return parts.every(
    (p) => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255,
  );
}

export function isIPv6(ip: string): boolean {
  const s = stripBracketsAndZone(ip);
  if (s.length < 2 || s.indexOf(":") === -1) return false;
  if (!/^[0-9a-fA-F:.]+$/.test(s)) return false;
  const segments = s.split(":");
  if (s.includes("::")) {
    return segments.length <= 8;
  } else {
    return segments.length === 8;
  }
}

export function stripPort(ip: string): string {
  let s = ip.trim();
  // Use regex to remove port from bracketed IPv6 (e.g., [::1]:3000)
  // Matches [IPv6]:port or [IPv6]
  const ipv6Bracketed = /^\[([^\]]+)\](?::\d+)?$/;
  const match = s.match(ipv6Bracketed);
  if (match && match[1]) {
    return match[1]; // IPv6 address without brackets or port
  }
  // Remove port for IPv4 (e.g., 127.0.0.1:3000)
  const colonIdx = s.lastIndexOf(":");
  if (colonIdx !== -1) {
    const beforeColon = s.slice(0, colonIdx);
    const afterColon = s.slice(colonIdx + 1);
    if (/^[0-9.]+$/.test(beforeColon) && /^\d+$/.test(afterColon)) {
      // Looks like IPv4:port
      s = beforeColon;
    }
  }
  return s;
}

export function normalizeIp(
  ip: string,
): { family: 4 | 6; normalized: string } | null {
  if (!ip) {
    return null;
  }
  // Remove port for IPv4 or IPv6
  const s = stripBracketsAndZone(stripPort(ip));
  if (isIPv4(s)) {
    return { family: 4, normalized: s };
  }
  if (isIPv6(s)) {
    return { family: 6, normalized: s.toLowerCase() };
  }
  return null;
}

function expandIPv6(ip: string): string[] {
  // Expand compressed IPv6 to 8 segments, lowercased
  if (ip.includes("::")) {
    let [head, tail] = ip.split("::");
    let headParts = head ? head.split(":").filter(Boolean) : [];
    let tailParts = tail ? tail.split(":").filter(Boolean) : [];
    let missing = 8 - (headParts.length + tailParts.length);
    return [
      ...headParts.map((s) => s.toLowerCase() || "0"),
      ...Array(missing).fill("0"),
      ...tailParts.map((s) => s.toLowerCase() || "0"),
    ];
  } else {
    // Already uncompressed, just split and lowercase
    return ip.split(":").map((s) => s.toLowerCase() || "0");
  }
}

export function isIpMatch(
  ipA: string,
  ipB: string,
  strict: boolean = true,
): boolean {
  const a = normalizeIp(ipA);
  const b = normalizeIp(ipB);
  if (!a || !b || a.family !== b.family) {
    return false;
  }
  if (a.family === 4) {
    return a.normalized === b.normalized;
  }
  // IPv6: compare all 8 segments if strict, else first 4 segments
  const segA = expandIPv6(a.normalized);
  const segB = expandIPv6(b.normalized);
  if (strict) {
    return (
      segA.length === 8 &&
      segB.length === 8 &&
      segA.join(":") === segB.join(":")
    );
  } else {
    return segA.slice(0, 4).join(":") === segB.slice(0, 4).join(":");
  }
}
