/**
 * Interface for SAML signing implementations.
 * This allows for different signing strategies (local, HTTP, etc.)
 */
export interface SamlSigner {
  /**
   * Signs SAML XML content with the provided private key and certificate
   * @param xmlContent - The XML content to sign
   * @param privateKey - The private key in PEM format
   * @param publicCert - The public certificate
   * @returns The signed XML content
   */
  signSAML(
    xmlContent: string,
    privateKey: string,
    publicCert: string,
  ): Promise<string>;
}
