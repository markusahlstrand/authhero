import { describe, it, expect } from "vitest";
import { createSamlMetadata } from "../src/helpers";
import { HttpSamlSigner } from "../src/signers/http";

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
});
