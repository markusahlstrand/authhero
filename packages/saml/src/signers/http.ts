import { SamlSigner } from "../signer";

/**
 * HTTP-based SAML signer that delegates signing to a remote endpoint.
 * This implementation can be used in edge/browser environments where xml-crypto is not available.
 */
export class HttpSamlSigner implements SamlSigner {
  constructor(private signUrl: string) {}

  async signSAML(
    xmlContent: string,
    privateKey: string,
    publicCert: string,
  ): Promise<string> {
    const response = await fetch(this.signUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        xmlContent,
        privateKey,
        publicCert,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to sign SAML via HTTP: ${response.status} ${response.statusText}`,
      );
    }

    return await response.text();
  }
}
