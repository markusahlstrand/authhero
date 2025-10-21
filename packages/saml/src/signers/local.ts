import { SamlSigner } from "../signer";

const signatureAlgorithm = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const digestAlgorithm = "http://www.w3.org/2001/04/xmlenc#sha256";
const canonicalizationAlgorithm = "http://www.w3.org/2001/10/xml-exc-c14n#";

/**
 * Local SAML signer that uses xml-crypto library.
 * This implementation requires Node.js and cannot be used in edge/browser environments.
 */
export class LocalSamlSigner implements SamlSigner {
  async signSAML(
    xmlContent: string,
    privateKey: string,
    publicCert: string,
  ): Promise<string> {
    // Dynamically import xml-crypto to avoid issues in environments where it's not available
    try {
      const { SignedXml } = await import("xml-crypto");

      const sig = new SignedXml({ privateKey, publicCert });
      sig.canonicalizationAlgorithm = canonicalizationAlgorithm;
      sig.addReference({
        xpath: "(/*[local-name()='Response']/*[local-name()='Assertion'])[1]",
        digestAlgorithm: digestAlgorithm,
        transforms: [
          "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
          canonicalizationAlgorithm,
        ],
      });

      sig.signatureAlgorithm = signatureAlgorithm;
      sig.computeSignature(xmlContent, {
        // according to:
        // https://docs.oasis-open.org/security/saml/v2.0/saml-schema-assertion-2.0.xsd
        // Assertion's ds:Signature must be after Assertion/Issuer
        location: {
          reference:
            "/*[local-name()='Response']/*[local-name()='Assertion']/*[local-name()='Issuer']",
          action: "after",
        },
      });

      return sig.getSignedXml();
    } catch (error) {
      throw new Error(
        `Failed to sign SAML locally. Make sure xml-crypto is installed. Error: ${error}`,
      );
    }
  }
}
