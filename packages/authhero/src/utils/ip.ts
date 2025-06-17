// Detect IPv4
export function isIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every(
    (p) => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255,
  );
}
// Detect IPv6
export function isIPv6(ip: string): boolean {
  if (ip.length < 2 || ip.indexOf(":") === -1) return false;
  // Remove square brackets (common in URLs)
  let s = ip;
  if (s.startsWith("[") && s.endsWith("]")) {
    s = s.slice(1, -1);
  }
  // Remove zone ID if present (e.g., fe80::1%eth0)
  const percentIdx = s.indexOf("%");
  if (percentIdx !== -1) s = s.slice(0, percentIdx);
  if (!/^[0-9a-fA-F:.]+$/.test(s)) return false;
  const segments = s.split(":");
  if (s.includes("::")) {
    // Compressed form: can have fewer than 8 segments, but never more
    return segments.length <= 8;
  } else {
    // Uncompressed: must have exactly 8 segments
    return segments.length === 8;
  }
}

export function normalizeIp(
  ip: string,
): { family: 4 | 6; normalized: string } | null {
  if (!ip) {
    return null;
  }
  let s = ip.trim();

  if (isIPv4(s)) {
    // Remove port for IPv4 (e.g., 127.0.0.1:3000)
    const colonIdx = s.indexOf(":");
    if (colonIdx !== -1 && /^[0-9.]+$/.test(s.slice(0, colonIdx))) {
      s = s.slice(0, colonIdx);
    }
    return { family: 4, normalized: s };
  }
  if (isIPv6(s)) {
    // Remove square brackets (common in URLs)
    if (s.startsWith("[") && s.endsWith("]")) {
      s = s.slice(1, -1);
    }

    // Remove zone ID if present (e.g., fe80::1%eth0)
    const percentIdx = s.indexOf("%");
    if (percentIdx !== -1) s = s.slice(0, percentIdx);
    return { family: 6, normalized: s.toLowerCase() };
  }
  return null;
}

export function isIpMatch(ipA: string, ipB: string): boolean {
  const a = normalizeIp(ipA);
  const b = normalizeIp(ipB);
  if (!a || !b || a.family !== b.family) return false;
  if (a.family === 4) {
    return a.normalized === b.normalized;
  }
  // IPv6: compare first 4 segments (expand compressed form)
  const expand = (ip: string): string[] => {
    if (ip.includes("::")) {
      let [head, tail] = ip.split("::");
      let headParts = head ? head.split(":").filter(Boolean) : [];
      let tailParts = tail ? tail.split(":").filter(Boolean) : [];
      let missing = 8 - (headParts.length + tailParts.length);
      return [
        ...headParts.map((s) => s || "0"),
        ...Array(missing).fill("0"),
        ...tailParts.map((s) => s || "0"),
      ];
    } else {
      // Already uncompressed, just split and lowercase
      return ip.split(":").map((s) => s.toLowerCase() || "0");
    }
  };
  const segA = expand(a.normalized).slice(0, 4);
  const segB = expand(b.normalized).slice(0, 4);
  return (
    segA.length === 4 && segB.length === 4 && segA.join(":") === segB.join(":")
  );
}
