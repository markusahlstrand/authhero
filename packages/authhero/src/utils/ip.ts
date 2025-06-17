// Utility to compare IP addresses
// For IPv6, compares only the first 4 segments; for IPv4, compares the full address
export function isIpMatch(ipA: string, ipB: string): boolean {
  if (!ipA || !ipB) return false;

  // Remove zone ID if present (e.g., fe80::1%eth0)
  const cleanA = ipA.split('%')[0] ?? '';
  const cleanB = ipB.split('%')[0] ?? '';

  const isIPv6 = cleanA.includes(":") && cleanB.includes(":");
  if (isIPv6) {
    // Expand compressed IPv6 addresses to full form
    const expand = (ip: string): string[] => {
      const parts = ip.split(":");
      if (ip.includes("::")) {
        const nonEmpty = parts.filter(p => p.length > 0);
        const missing = 8 - nonEmpty.length;
        const expanded: string[] = [];
        let expandedOnce = false;
        for (let i = 0; i < parts.length; i++) {
          if (parts[i] === "" && !expandedOnce) {
            expanded.push(...Array(missing + 1).fill("0"));
            expandedOnce = true;
          } else if (parts[i] !== "") {
            expanded.push(parts[i]!);
          }
        }
        return expanded;
      }
      // Fill up to 8 segments if short (shouldn't happen for canonical, but for safety)
      return parts.map(p => p || "0").concat(Array(8 - parts.length).fill("0"));
    };
    const segA = expand(cleanA).slice(0, 4).map(s => (s || "0").toLowerCase());
    const segB = expand(cleanB).slice(0, 4).map(s => (s || "0").toLowerCase());
    return segA.length === 4 && segB.length === 4 && segA.join(":") === segB.join(":");
  }
  // Assume IPv4
  return cleanA === cleanB;
}
