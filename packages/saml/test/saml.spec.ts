import { describe, it, expect } from "vitest";
import { createSamlMetadata, createSamlResponse } from "../src/helpers";
import { HttpSamlSigner } from "../src/signers/http";
import { XMLParser } from "fast-xml-parser";

describe("SAML Package", () => {
  describe("createSamlMetadata", () => {
    it("should create valid SAML metadata XML", () => {
      const metadata = createSamlMetadata({
        entityId: "https://idp.example.com",
        assertionConsumerServiceUrl: "https://idp.example.com/acs",
        singleLogoutServiceUrl: "https://idp.example.com/slo",
        certificates: ["TEST_CERTIFICATE_1", "TEST_CERTIFICATE_2"],
      });

      expect(metadata).toContain("EntityDescriptor");
      expect(metadata).toContain("https://idp.example.com");
      expect(metadata).toContain("https://idp.example.com/acs");
      expect(metadata).toContain("TEST_CERTIFICATE_1");
    });
  });

  describe("HttpSamlSigner", () => {
    it("should create HttpSamlSigner instance", () => {
      const signer = new HttpSamlSigner("https://signing-service.com/sign");
      expect(signer).toBeDefined();
      expect(signer).toHaveProperty("signSAML");
    });

    it("should have signSAML method", () => {
      const signer = new HttpSamlSigner("https://signing-service.com/sign");
      expect(typeof signer.signSAML).toBe("function");
    });
  });

  describe("createSamlResponse", () => {
    it("should generate SAML response with correct attribute structure", async () => {
      // Create a SAML response without signing
      const samlResponse = await createSamlResponse({
        issuer: "https://token.sesamy.com/",
        audience: "https://sp.example.com/metadata",
        destination: "https://sp.example.com/saml/consume",
        userId: "6f81f2e7-6fe2-4ae6-a956-96f152a3ce15",
        email: "test@example.com",
        sessionIndex: "test-session-index",
        inResponseTo: "_test-request-id",
        encode: false, // Get raw XML for testing
      });

      // Parse the XML to verify structure
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
      });
      const parsed = parser.parse(samlResponse);

      // Verify that saml:Attribute elements have the correct attributes
      // Find the AttributeStatement in the response
      const response = parsed["samlp:Response"];
      expect(response).toBeDefined();

      const assertion = response["saml:Assertion"];
      expect(assertion).toBeDefined();

      const attributeStatement = assertion["saml:AttributeStatement"];
      expect(attributeStatement).toBeDefined();

      const attributes = attributeStatement["saml:Attribute"];
      expect(attributes).toBeDefined();
      expect(Array.isArray(attributes)).toBe(true);

      // Check the first attribute (id attribute with FriendlyName)
      const idAttribute = attributes[0];
      expect(idAttribute["@_Name"]).toBe("id");
      expect(idAttribute["@_FriendlyName"]).toBe("persistent");
      expect(idAttribute["@_NameFormat"]).toBe(
        "urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified",
      );

      // Check that AttributeValue exists and has the correct value
      const idAttributeValue = idAttribute["saml:AttributeValue"];
      expect(idAttributeValue).toBeDefined();
      expect(idAttributeValue["#text"]).toBe(
        "6f81f2e7-6fe2-4ae6-a956-96f152a3ce15",
      );

      // Check the email attribute (no FriendlyName)
      const emailAttribute = attributes[1];
      expect(emailAttribute["@_Name"]).toBe("email");
      expect(emailAttribute["@_FriendlyName"]).toBeUndefined();
      expect(emailAttribute["@_NameFormat"]).toBe(
        "urn:oasis:names:tc:SAML:2.0:attrname-format:basic",
      );
      expect(emailAttribute["saml:AttributeValue"]["#text"]).toBe(
        "test@example.com",
      );

      // Check Role attributes
      const roleAttributes = attributes.slice(2);
      expect(roleAttributes.length).toBeGreaterThanOrEqual(6);

      roleAttributes.forEach((roleAttr) => {
        expect(roleAttr["@_Name"]).toBe("Role");
        expect(roleAttr["@_NameFormat"]).toBe(
          "urn:oasis:names:tc:SAML:2.0:attrname-format:basic",
        );
        expect(roleAttr["saml:AttributeValue"]).toBeDefined();
        expect(roleAttr["saml:AttributeValue"]["#text"]).toBeDefined();
      });

      // Validate the raw XML structure matches expected format
      // Attributes should be on <saml:Attribute>, not <saml:AttributeValue>
      expect(samlResponse).toContain(
        '<saml:Attribute FriendlyName="persistent" Name="id" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified">',
      );
      expect(samlResponse).toContain(
        '<saml:Attribute Name="email" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">',
      );
      expect(samlResponse).toContain(
        '<saml:Attribute Name="Role" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">',
      );

      // Ensure attributes are NOT on AttributeValue
      expect(samlResponse).not.toContain("<saml:AttributeValue FriendlyName=");
      expect(samlResponse).not.toContain('<saml:AttributeValue Name="id"');
      expect(samlResponse).not.toContain('<saml:AttributeValue Name="email"');
      expect(samlResponse).not.toContain('<saml:AttributeValue Name="Role"');

      // Verify AttributeValue has xmlns attributes
      expect(samlResponse).toContain(
        '<saml:AttributeValue xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:string">',
      );
    });

    it("should match the structure of working SAML response format", async () => {
      // This test validates that our generated SAML response has the same structure
      // as the working example from production
      const samlResponse = await createSamlResponse({
        issuer: "https://token.sesamy.com/",
        audience: "https://scplay.skiclassics.com/saml/metadata",
        destination: "https://scplay.skiclassics.com/saml/consume",
        userId: "6f81f2e7-6fe2-4ae6-a956-96f152a3ce15",
        email: "markus@sesamy.com",
        sessionIndex: "xi1OhdavumAvgsE0BCYb6",
        inResponseTo: "_2ea6cdbf-a3b1-481a-9521-6de776b9941b",
        encode: false,
      });

      // Verify the critical patterns that must match the working format
      const criticalPatterns = [
        // Attribute with FriendlyName, Name, and NameFormat on saml:Attribute
        /<saml:Attribute FriendlyName="persistent" Name="id" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified">/,
        // Attribute with Name and NameFormat (no FriendlyName)
        /<saml:Attribute Name="email" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">/,
        // Role attributes
        /<saml:Attribute Name="Role" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">/,
        // AttributeValue with xmlns attributes but NOT Name/FriendlyName/NameFormat
        /<saml:AttributeValue xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema" xmlns:xsi="http:\/\/www\.w3\.org\/2001\/XMLSchema-instance" xsi:type="xs:string">/,
      ];

      criticalPatterns.forEach((pattern) => {
        expect(samlResponse).toMatch(pattern);
      });

      // Verify incorrect patterns do NOT exist
      const incorrectPatterns = [
        // Attributes should NOT be on AttributeValue
        /<saml:AttributeValue[^>]*FriendlyName=/,
        /<saml:AttributeValue[^>]*Name="id"/,
        /<saml:AttributeValue[^>]*Name="email"/,
        /<saml:AttributeValue[^>]*NameFormat=/,
      ];

      incorrectPatterns.forEach((pattern) => {
        expect(samlResponse).not.toMatch(pattern);
      });
    });

    it("should validate exact attribute element structure from working example", async () => {
      // This test ensures our output exactly matches the working production format
      const samlResponse = await createSamlResponse({
        issuer: "https://token.sesamy.com/",
        audience: "https://example.com/metadata",
        destination: "https://example.com/saml/consume",
        userId: "test-user-id",
        email: "test@example.com",
        sessionIndex: "test-session",
        inResponseTo: "_test-id",
        encode: false,
      });

      // Extract just the AttributeStatement section for focused validation
      const attributeStatementMatch = samlResponse.match(
        /<saml:AttributeStatement>[\s\S]*?<\/saml:AttributeStatement>/,
      );
      expect(attributeStatementMatch).toBeTruthy();

      const attributeStatement = attributeStatementMatch![0];

      // Validate the structure of each attribute type:

      // 1. ID attribute with FriendlyName
      expect(attributeStatement).toMatch(
        /<saml:Attribute FriendlyName="persistent" Name="id" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified">\s*<saml:AttributeValue xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema" xmlns:xsi="http:\/\/www\.w3\.org\/2001\/XMLSchema-instance" xsi:type="xs:string">[\s\S]*?<\/saml:AttributeValue>\s*<\/saml:Attribute>/,
      );

      // 2. Email attribute without FriendlyName
      expect(attributeStatement).toMatch(
        /<saml:Attribute Name="email" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">\s*<saml:AttributeValue xmlns:xs="http:\/\/www\.w3\.org\/2001\/XMLSchema" xmlns:xsi="http:\/\/www\.w3\.org\/2001\/XMLSchema-instance" xsi:type="xs:string">[\s\S]*?<\/saml:AttributeValue>\s*<\/saml:Attribute>/,
      );

      // 3. Role attributes (multiple occurrences expected)
      const roleMatches = attributeStatement.match(
        /<saml:Attribute Name="Role" NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:basic">/g,
      );
      expect(roleMatches).toBeTruthy();
      expect(roleMatches!.length).toBeGreaterThanOrEqual(6); // Should have at least 6 role attributes

      // 4. Ensure closing tags are correct
      const attributeOpenTags = (
        attributeStatement.match(/<saml:Attribute\s+[^>]*>/g) || []
      ).length;
      const attributeCloseTags = (
        attributeStatement.match(/<\/saml:Attribute>/g) || []
      ).length;
      expect(attributeOpenTags).toBe(attributeCloseTags);

      // 5. Validate that ALL attributes follow the correct pattern
      // Extract all Attribute elements
      const allAttributeMatches = attributeStatement.match(
        /<saml:Attribute[^>]*>[\s\S]*?<\/saml:Attribute>/g,
      );
      expect(allAttributeMatches).toBeTruthy();

      allAttributeMatches!.forEach((attr) => {
        // Each Attribute must have Name and NameFormat on the opening tag
        expect(attr).toMatch(/<saml:Attribute[^>]*Name="[^"]+"/);
        expect(attr).toMatch(/<saml:Attribute[^>]*NameFormat="[^"]+"/);

        // AttributeValue must NOT have Name, NameFormat, or FriendlyName
        expect(attr).not.toMatch(/<saml:AttributeValue[^>]*Name=/);
        expect(attr).not.toMatch(/<saml:AttributeValue[^>]*NameFormat=/);
        expect(attr).not.toMatch(/<saml:AttributeValue[^>]*FriendlyName=/);

        // AttributeValue should have xmlns attributes
        expect(attr).toMatch(
          /<saml:AttributeValue[^>]*xmlns:xsi="http:\/\/www\.w3\.org\/2001\/XMLSchema-instance"/,
        );
        expect(attr).toMatch(/<saml:AttributeValue[^>]*xsi:type="xs:string"/);
      });
    });
  });
});
