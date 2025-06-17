// Utility to compare IP addresses
// For IPv6, compares only the first 4 segments; for IPv4, compares the full address
export function isIpMatch(ipA: string, ipB: string): boolean {
  if (!ipA || !ipB) return false;
  const isIPv6 = ipA.includes(":") && ipB.includes(":");
  if (isIPv6) {
    const segA = ipA.split(":").slice(0, 4).join(":");
    const segB = ipB.split(":").slice(0, 4).join(":");
    return segA === segB;
  }
  // Assume IPv4
  return ipA === ipB;
}
