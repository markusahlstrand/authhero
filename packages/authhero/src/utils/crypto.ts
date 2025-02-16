import { sha256 } from "oslo/crypto";
import { base64url } from "oslo/encoding";

export function pemToBuffer(pem: string): ArrayBuffer {
  try {
    const pemRegex =
      /-----BEGIN (?:RSA )?(?:PRIVATE|PUBLIC) KEY-----([^-]*)-----END (?:RSA )?(?:PRIVATE|PUBLIC) KEY-----/;
    const matches = pemRegex.exec(pem);

    if (!matches || !matches[1]) {
      throw new Error("Invalid PEM format");
    }

    return Uint8Array.from(atob(matches[1].replace(/\s/g, "")), (c) =>
      c.charCodeAt(0),
    ).buffer;
  } finally {
    // Basic cleanup of the input string
    pem = pem.replace(/./g, "\0");
  }
}

export async function computeCodeChallenge(
  codeVerifier: string,
  method: "plain" | "S256",
): Promise<string> {
  if (method === "plain") {
    return codeVerifier;
  }

  // S256 hashing
  const encodedData = new TextEncoder().encode(codeVerifier);
  const hashedVerifier = await sha256(encodedData);

  // Convert to base64url without padding
  return base64url.encode(new Uint8Array(hashedVerifier), {
    includePadding: false,
  });
}
