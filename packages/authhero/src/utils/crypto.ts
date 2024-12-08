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
