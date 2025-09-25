import { describe, it, expect } from "vitest";
import { createSamlMetadata, SAMLMetadataParams } from "../src/saml";
import { XMLParser } from "fast-xml-parser";
import { getCertificate } from "./token";

describe("createSamlMetadata", () => {
  it("should create SAML metadata with a single certificate", async () => {
    const certificate = await getCertificate();
    const testParams: SAMLMetadataParams = {
      entityId: "test-entity-id",
      assertionConsumerServiceUrl: "https://example.com/saml/acs",
      singleLogoutServiceUrl: "https://example.com/saml/sls",
      certificates: [certificate.cert],
    };

    const metadata = createSamlMetadata(testParams);

    // Parse the generated XML to verify structure
    const parser = new XMLParser({
      attributeNamePrefix: "@_",
      ignoreAttributes: false,
    });
    const parsedMetadata = parser.parse(metadata);

    // Verify top-level structure
    expect(parsedMetadata.EntityDescriptor).toBeDefined();
    expect(parsedMetadata.EntityDescriptor["@_entityID"]).toBe(
      "test-entity-id",
    );
    expect(parsedMetadata.EntityDescriptor["@_xmlns"]).toBe(
      "urn:oasis:names:tc:SAML:2.0:metadata",
    );

    // Verify IDPSSODescriptor
    const idpDescriptor = parsedMetadata.EntityDescriptor.IDPSSODescriptor;
    expect(idpDescriptor).toBeDefined();
    expect(idpDescriptor["@_protocolSupportEnumeration"]).toBe(
      "urn:oasis:names:tc:SAML:2.0:protocol",
    );

    // Verify KeyDescriptor for certificate
    expect(idpDescriptor.KeyDescriptor).toBeDefined();
    // When there's only one KeyDescriptor, it's parsed as an object, not an array
    const keyDescriptor = Array.isArray(idpDescriptor.KeyDescriptor)
      ? idpDescriptor.KeyDescriptor[0]
      : idpDescriptor.KeyDescriptor;
    expect(keyDescriptor["@_use"]).toBe("signing");
    expect(keyDescriptor.KeyInfo.X509Data.X509Certificate).toBe(
      certificate.cert,
    );

    // Verify SingleLogoutService
    const singleLogoutServices = idpDescriptor.SingleLogoutService;
    expect(singleLogoutServices).toBeDefined();
    expect(singleLogoutServices.length).toBe(2);

    // HTTP-Redirect binding
    expect(singleLogoutServices[0]["@_Binding"]).toBe(
      "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
    );
    expect(singleLogoutServices[0]["@_Location"]).toBe(
      "https://example.com/saml/sls",
    );

    // HTTP-POST binding
    expect(singleLogoutServices[1]["@_Binding"]).toBe(
      "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
    );
    expect(singleLogoutServices[1]["@_Location"]).toBe(
      "https://example.com/saml/sls",
    );

    // Verify SingleSignOnService
    const singleSignOnServices = idpDescriptor.SingleSignOnService;
    expect(singleSignOnServices).toBeDefined();
    expect(singleSignOnServices.length).toBe(2);

    // HTTP-Redirect binding
    expect(singleSignOnServices[0]["@_Binding"]).toBe(
      "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
    );
    expect(singleSignOnServices[0]["@_Location"]).toBe(
      "https://example.com/saml/acs",
    );

    // HTTP-POST binding
    expect(singleSignOnServices[1]["@_Binding"]).toBe(
      "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
    );
    expect(singleSignOnServices[1]["@_Location"]).toBe(
      "https://example.com/saml/acs",
    );

    // Verify NameIDFormat
    const nameIdFormats = idpDescriptor.NameIDFormat;
    expect(nameIdFormats).toBeDefined();
    expect(nameIdFormats.length).toBe(3);
    expect(nameIdFormats[0]).toBe(
      "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    );
    expect(nameIdFormats[1]).toBe(
      "urn:oasis:names:tc:SAML:2.0:nameid-format:persistent",
    );
    expect(nameIdFormats[2]).toBe(
      "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
    );

    // Verify Attributes
    const attributes = idpDescriptor.Attribute;
    expect(attributes).toBeDefined();
    expect(attributes.length).toBe(5);

    const expectedAttributes = [
      {
        name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
        friendlyName: "E-Mail Address",
      },
      {
        name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
        friendlyName: "Given Name",
      },
      {
        name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
        friendlyName: "Name",
      },
      {
        name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
        friendlyName: "Surname",
      },
      {
        name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
        friendlyName: "Name ID",
      },
    ];

    expectedAttributes.forEach((expectedAttr, index) => {
      expect(attributes[index]["@_Name"]).toBe(expectedAttr.name);
      expect(attributes[index]["@_FriendlyName"]).toBe(
        expectedAttr.friendlyName,
      );
      expect(attributes[index]["@_NameFormat"]).toBe(
        "urn:oasis:names:tc:SAML:2.0:attrname-format:uri",
      );
      expect(attributes[index]["@_xmlns"]).toBe(
        "urn:oasis:names:tc:SAML:2.0:assertion",
      );
    });
  });

  it("should create SAML metadata with multiple certificates", async () => {
    const certificate1 = await getCertificate();
    const certificate2 = await getCertificate();

    const testParams: SAMLMetadataParams = {
      entityId: "multi-cert-entity",
      assertionConsumerServiceUrl: "https://example.com/saml/acs",
      singleLogoutServiceUrl: "https://example.com/saml/sls",
      certificates: [certificate1.cert, certificate2.cert],
    };

    const metadata = createSamlMetadata(testParams);

    // Parse the generated XML to verify structure
    const parser = new XMLParser({
      attributeNamePrefix: "@_",
      ignoreAttributes: false,
    });
    const parsedMetadata = parser.parse(metadata);

    // Verify IDPSSODescriptor has multiple KeyDescriptors
    const idpDescriptor = parsedMetadata.EntityDescriptor.IDPSSODescriptor;
    expect(idpDescriptor.KeyDescriptor).toBeDefined();

    // With multiple certificates, KeyDescriptor should be an array
    expect(Array.isArray(idpDescriptor.KeyDescriptor)).toBe(true);
    expect(idpDescriptor.KeyDescriptor.length).toBe(2);

    // Verify both certificates are present
    expect(idpDescriptor.KeyDescriptor[0]["@_use"]).toBe("signing");
    expect(
      idpDescriptor.KeyDescriptor[0].KeyInfo.X509Data.X509Certificate,
    ).toBe(certificate1.cert);

    expect(idpDescriptor.KeyDescriptor[1]["@_use"]).toBe("signing");
    expect(
      idpDescriptor.KeyDescriptor[1].KeyInfo.X509Data.X509Certificate,
    ).toBe(certificate2.cert);
  });

  it("should generate valid XML structure", () => {
    const testParams: SAMLMetadataParams = {
      entityId: "test-entity",
      assertionConsumerServiceUrl: "https://example.com/acs",
      singleLogoutServiceUrl: "https://example.com/sls",
      certificates: ["test-certificate"],
    };

    const metadata = createSamlMetadata(testParams);

    // Should be valid XML (but without XML declaration as per XMLBuilder config)
    expect(metadata).toContain("EntityDescriptor");
    expect(metadata).toContain("IDPSSODescriptor");
    expect(metadata).toContain("KeyDescriptor");
    expect(metadata).toContain("SingleLogoutService");
    expect(metadata).toContain("SingleSignOnService");
    expect(metadata).toContain("NameIDFormat");
    expect(metadata).toContain("Attribute");

    // Should contain our test values
    expect(metadata).toContain("test-entity");
    expect(metadata).toContain("https://example.com/acs");
    expect(metadata).toContain("https://example.com/sls");
    expect(metadata).toContain("test-certificate");
  });

  it("should handle empty certificates array", () => {
    const testParams: SAMLMetadataParams = {
      entityId: "no-cert-entity",
      assertionConsumerServiceUrl: "https://example.com/acs",
      singleLogoutServiceUrl: "https://example.com/sls",
      certificates: [],
    };

    const metadata = createSamlMetadata(testParams);

    // Parse the generated XML to verify structure
    const parser = new XMLParser({
      attributeNamePrefix: "@_",
      ignoreAttributes: false,
    });
    const parsedMetadata = parser.parse(metadata);

    // Should still have valid structure but no KeyDescriptors
    expect(parsedMetadata.EntityDescriptor).toBeDefined();
    const idpDescriptor = parsedMetadata.EntityDescriptor.IDPSSODescriptor;
    expect(idpDescriptor).toBeDefined();

    // KeyDescriptor should not exist when no certificates provided
    expect(idpDescriptor.KeyDescriptor).toBeUndefined();
  });

  it("should escape special characters in URLs", () => {
    const testParams: SAMLMetadataParams = {
      entityId: "test&entity",
      assertionConsumerServiceUrl:
        "https://example.com/acs?param=value&other=test",
      singleLogoutServiceUrl: "https://example.com/sls?param=value&other=test",
      certificates: ["test-cert"],
    };

    const metadata = createSamlMetadata(testParams);

    // Parse the generated XML to verify proper escaping
    const parser = new XMLParser({
      attributeNamePrefix: "@_",
      ignoreAttributes: false,
    });

    // Should not throw an error when parsing
    expect(() => parser.parse(metadata)).not.toThrow();

    const parsedMetadata = parser.parse(metadata);

    // Verify the values are properly preserved
    expect(parsedMetadata.EntityDescriptor["@_entityID"]).toBe("test&entity");

    const idpDescriptor = parsedMetadata.EntityDescriptor.IDPSSODescriptor;
    const ssoService = idpDescriptor.SingleSignOnService[0];
    const sloService = idpDescriptor.SingleLogoutService[0];

    expect(ssoService["@_Location"]).toBe(
      "https://example.com/acs?param=value&other=test",
    );
    expect(sloService["@_Location"]).toBe(
      "https://example.com/sls?param=value&other=test",
    );
  });
});
