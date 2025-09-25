import { z } from "zod";

// Helper schemas
const textSchema = z.object({ "#text": z.string() });

export const samlIssuerSchema = z.object({
  "#text": z.string(),
  "@_xmlns:saml": z.string().optional(),
});

export const samlRequestSchema = z.object({
  "samlp:AuthnRequest": z.object({
    "saml:Issuer": samlIssuerSchema,
    "@_xmlns:samlp": z.string(),
    "@_xmlns:saml": z.string().optional(),
    "@_ForceAuthn": z
      .string()
      .transform((val) => val.toLowerCase() === "true")
      .optional(),
    "@_ID": z.string(),
    "@_IssueInstant": z.string().datetime(),
    "@_Destination": z.string().url(),
    "@_AssertionConsumerServiceURL": z.string().url().optional(),
    "@_ProtocolBinding": z.string().optional(),
    "@_Version": z.string(),
  }),
});

export const samlMetadataResponseSchema = z.array(
  z.object({
    ":@": z.object({
      "@_xmlns": z.string(),
      "@_entityID": z.string(),
    }),
    EntityDescriptor: z.array(
      z.object({
        ":@": z.object({
          "@_protocolSupportEnumeration": z.string(),
        }),
        IDPSSODescriptor: z.array(
          z.union([
            z.object({
              KeyDescriptor: z.array(
                z.object({
                  KeyInfo: z.array(
                    z.object({
                      X509Data: z.array(
                        z.object({
                          X509Certificate: z.array(textSchema),
                        }),
                      ),
                    }),
                  ),
                  ":@": z.object({
                    "@_xmlns": z.string(),
                  }),
                }),
              ),
              ":@": z.object({
                "@_use": z.string(),
              }),
            }),
            z.object({
              SingleLogoutService: z.array(z.object({})),
              ":@": z.object({
                "@_Binding": z.string(),
                "@_Location": z.string(),
              }),
            }),
            z.object({
              NameIDFormat: z.array(textSchema),
            }),
            z.object({
              SingleSignOnService: z.array(z.object({})),
              ":@": z.object({
                "@_Binding": z.string(),
                "@_Location": z.string(),
              }),
            }),
            z.object({
              Attribute: z.array(z.object({})),
              ":@": z.object({
                "@_Name": z.string(),
                "@_NameFormat": z.string(),
                "@_FriendlyName": z.string(),
                "@_xmlns": z.string(),
              }),
            }),
          ]),
        ),
      }),
    ),
  }),
);

export type SAMLMetadataResponse = z.infer<typeof samlMetadataResponseSchema>;

const attributeSchema = z.object({
  "saml:AttributeValue": z.array(
    z.object({
      "#text": z.string(),
    }),
  ),
  ":@": z.object({
    "@_xmlns:xs": z.string().optional(),
    "@_xmlns:xsi": z.string(),
    "@_xsi:type": z.string(),
    "@_Name": z.string().optional(),
    "@_NameFormat": z.string().optional(),
  }),
});

const transformSchema = z.object({
  "ds:Transform": z.array(z.any()),
  ":@": z.object({
    "@_Algorithm": z.string(),
  }),
});

export const dsSignatureSchema = z.object({
  "ds:Signature": z.array(
    z.union([
      z.object({
        "ds:SignedInfo": z.array(
          z.union([
            z.object({
              "ds:CanonicalizationMethod": z.array(z.string()),
              ":@": z.object({
                "@_Algorithm": z.string(),
              }),
            }),
            z.object({
              "ds:SignatureMethod": z.array(z.string()),
              ":@": z.object({
                "@_Algorithm": z.string(),
              }),
            }),
            z.object({
              "ds:Reference": z.array(
                z.union([
                  z.object({
                    "ds:Transforms": z.array(transformSchema),
                  }),
                  z.object({
                    "ds:DigestMethod": z.array(z.string()),
                    ":@": z.object({
                      "@_Algorithm": z.string(),
                    }),
                  }),
                  z.object({ "ds:DigestValue": z.array(textSchema) }),
                ]),
              ),
            }),
          ]),
        ),
      }),
      z.object({
        "ds:SignatureValue": z.array(textSchema),
      }),
      z.object({
        "ds:KeyInfo": z.array(
          z.object({
            "ds:KeyValue": z.array(
              z.object({
                "ds:RSAKeyValue": z.array(
                  z.union([
                    z.object({
                      "ds:Modulus": z.array(textSchema),
                    }),
                    z.object({
                      "ds:Exponent": z.array(textSchema),
                    }),
                  ]),
                ),
              }),
            ),
          }),
        ),
      }),
    ]),
  ),
  ":@": z.object({
    "@_xmlns:ds": z.string(),
  }),
});

export type DSIGSignature = z.infer<typeof dsSignatureSchema>;

export const samlResponseJsonSchema = z.array(
  z.object({
    "samlp:Response": z.array(
      z.union([
        z.object({
          "saml:Issuer": z.array(textSchema),
        }),
        dsSignatureSchema,
        z.object({
          "samlp:Status": z.array(
            z.object({
              "samlp:StatusCode": z.array(textSchema),
              ":@": z.object({
                "@_Value": z.string(),
              }),
            }),
          ),
        }),
        z.object({
          "saml:Assertion": z.array(
            z.union([
              z.object({
                "saml:Issuer": z.array(textSchema),
              }),
              dsSignatureSchema,
              z.object({
                "saml:Subject": z.array(
                  z.union([
                    z.object({
                      "saml:NameID": z.array(textSchema),
                      ":@": z.object({
                        "@_Format": z.string(),
                      }),
                    }),
                    z.object({
                      "saml:SubjectConfirmation": z.array(
                        z.object({
                          "saml:SubjectConfirmationData": z.array(z.any()),
                          ":@": z.object({
                            "@_InResponseTo": z.string(),
                            "@_NotOnOrAfter": z.string(),
                            "@_Recipient": z.string(),
                          }),
                        }),
                      ),
                      ":@": z.object({
                        "@_Method": z.string(),
                      }),
                    }),
                  ]),
                ),
              }),
              z.object({
                "saml:Conditions": z.array(
                  z.object({
                    "saml:AudienceRestriction": z.array(
                      z.object({
                        "saml:Audience": z.array(textSchema),
                      }),
                    ),
                  }),
                ),
                ":@": z.object({
                  "@_NotBefore": z.string(),
                  "@_NotOnOrAfter": z.string(),
                }),
              }),
              z.object({
                "saml:AuthnStatement": z.array(
                  z.object({
                    "saml:AuthnContext": z.array(
                      z.object({
                        "saml:AuthnContextClassRef": z.array(textSchema),
                      }),
                    ),
                  }),
                ),
                ":@": z.object({
                  "@_AuthnInstant": z.string(),
                  "@_SessionIndex": z.string(),
                  "@_SessionNotOnOrAfter": z.string(),
                }),
              }),
              z.object({
                "saml:AttributeStatement": z.array(
                  z.object({
                    "saml:Attribute": z.array(attributeSchema),
                    ":@": z.object({
                      "@_FriendlyName": z.string().optional(),
                      "@_Name": z.string(),
                      "@_NameFormat": z.string(),
                    }),
                  }),
                ),
              }),
            ]),
          ),
          ":@": z.object({
            "@_xmlns": z.string(),
            "@_ID": z.string(),
            "@_IssueInstant": z.string(),
            "@_Version": z.string(),
          }),
        }),
      ]),
    ),
    ":@": z.object({
      "@_xmlns:samlp": z.string(),
      "@_xmlns:saml": z.string(),
      "@_Destination": z.string(),
      "@_ID": z.string(),
      "@_InResponseTo": z.string(),
      "@_IssueInstant": z.string(),
      "@_Version": z.string(),
    }),
  }),
);

export type SAMLResponseJSON = z.infer<typeof samlResponseJsonSchema>;
