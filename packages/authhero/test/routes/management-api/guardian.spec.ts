import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

describe("guardian management API endpoints", () => {
    describe("GET /api/v2/guardian/factors", () => {
        it("should return all factors with default disabled state", async () => {
            const { managementApp, env } = await getTestServer();
            const token = await getAdminToken();

            const response = await managementApp.request(
                "/guardian/factors",
                {
                    method: "GET",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                    },
                },
                env,
            );

            expect(response.status).toBe(200);
            const factors = await response.json();

            expect(factors).toBeInstanceOf(Array);
            expect(factors).toHaveLength(8);

            // All factors should be disabled by default
            for (const factor of factors as { enabled: boolean; trial_expired: boolean }[]) {
                expect(factor).toHaveProperty("enabled", false);
                expect(factor).toHaveProperty("trial_expired", false);
            }

            // Check all expected factor names exist
            const factorNames = (factors as { name: string }[]).map((f) => f.name);
            expect(factorNames).toContain("sms");
            expect(factorNames).toContain("otp");
            expect(factorNames).toContain("email");
            expect(factorNames).toContain("push-notification");
            expect(factorNames).toContain("webauthn-roaming");
            expect(factorNames).toContain("webauthn-platform");
            expect(factorNames).toContain("recovery-code");
            expect(factorNames).toContain("duo");
        });
    });

    describe("GET /api/v2/guardian/factors/:factor_name", () => {
        it("should return a specific factor", async () => {
            const { managementApp, env } = await getTestServer();
            const token = await getAdminToken();

            const response = await managementApp.request(
                "/guardian/factors/sms",
                {
                    method: "GET",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                    },
                },
                env,
            );

            expect(response.status).toBe(200);
            const factor = await response.json();

            expect(factor).toHaveProperty("name", "sms");
            expect(factor).toHaveProperty("enabled", false);
            expect(factor).toHaveProperty("trial_expired", false);
        });
    });

    describe("PUT /api/v2/guardian/factors/:factor_name", () => {
        it("should enable a factor", async () => {
            const { managementApp, env } = await getTestServer();
            const token = await getAdminToken();

            // Enable SMS factor
            const enableResponse = await managementApp.request(
                "/guardian/factors/sms",
                {
                    method: "PUT",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({ enabled: true }),
                },
                env,
            );

            expect(enableResponse.status).toBe(200);
            const enabledFactor = await enableResponse.json();

            expect(enabledFactor).toHaveProperty("name", "sms");
            expect(enabledFactor).toHaveProperty("enabled", true);

            // Verify by retrieving the factor
            const getResponse = await managementApp.request(
                "/guardian/factors/sms",
                {
                    method: "GET",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                    },
                },
                env,
            );

            expect(getResponse.status).toBe(200);
            const retrievedFactor = await getResponse.json();
            expect(retrievedFactor).toHaveProperty("enabled", true);
        });

        it("should disable a factor", async () => {
            const { managementApp, env } = await getTestServer();
            const token = await getAdminToken();

            // First enable the factor
            await managementApp.request(
                "/guardian/factors/otp",
                {
                    method: "PUT",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({ enabled: true }),
                },
                env,
            );

            // Then disable it
            const disableResponse = await managementApp.request(
                "/guardian/factors/otp",
                {
                    method: "PUT",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({ enabled: false }),
                },
                env,
            );

            expect(disableResponse.status).toBe(200);
            const disabledFactor = await disableResponse.json();
            expect(disabledFactor).toHaveProperty("enabled", false);
        });

        it("should enable multiple factors independently", async () => {
            const { managementApp, env } = await getTestServer();
            const token = await getAdminToken();

            // Enable SMS
            await managementApp.request(
                "/guardian/factors/sms",
                {
                    method: "PUT",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({ enabled: true }),
                },
                env,
            );

            // Enable OTP
            await managementApp.request(
                "/guardian/factors/otp",
                {
                    method: "PUT",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({ enabled: true }),
                },
                env,
            );

            // Disable email to ensure it stays disabled
            await managementApp.request(
                "/guardian/factors/email",
                {
                    method: "PUT",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({ enabled: false }),
                },
                env,
            );

            // Verify factors state
            const allFactorsResponse = await managementApp.request(
                "/guardian/factors",
                {
                    method: "GET",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                    },
                },
                env,
            );

            expect(allFactorsResponse.status).toBe(200);
            const factors = (await allFactorsResponse.json()) as { name: string; enabled: boolean }[];

            const smsFactor = factors.find((f) => f.name === "sms");
            const otpFactor = factors.find((f) => f.name === "otp");
            const emailFactor = factors.find((f) => f.name === "email");

            expect(smsFactor).toHaveProperty("enabled", true);
            expect(otpFactor).toHaveProperty("enabled", true);
            expect(emailFactor).toHaveProperty("enabled", false);
        });
    });

    describe("GET /api/v2/guardian/factors/sms/selected-provider", () => {
        it("should return default twilio provider", async () => {
            const { managementApp, env } = await getTestServer();
            const token = await getAdminToken();

            const response = await managementApp.request(
                "/guardian/factors/sms/selected-provider",
                {
                    method: "GET",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                    },
                },
                env,
            );

            expect(response.status).toBe(200);
            const provider = await response.json();
            expect(provider).toHaveProperty("provider", "twilio");
        });
    });

    describe("PUT /api/v2/guardian/factors/sms/selected-provider", () => {
        it("should update SMS provider", async () => {
            const { managementApp, env } = await getTestServer();
            const token = await getAdminToken();

            // Update provider to vonage
            const updateResponse = await managementApp.request(
                "/guardian/factors/sms/selected-provider",
                {
                    method: "PUT",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({ provider: "vonage" }),
                },
                env,
            );

            expect(updateResponse.status).toBe(200);
            const updatedProvider = await updateResponse.json();
            expect(updatedProvider).toHaveProperty("provider", "vonage");

            // Verify by retrieving
            const getResponse = await managementApp.request(
                "/guardian/factors/sms/selected-provider",
                {
                    method: "GET",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                    },
                },
                env,
            );

            expect(getResponse.status).toBe(200);
            const retrievedProvider = await getResponse.json();
            expect(retrievedProvider).toHaveProperty("provider", "vonage");
        });
    });

    describe("GET /api/v2/guardian/factors/sms/providers/twilio", () => {
        it("should return empty twilio config by default", async () => {
            const { managementApp, env } = await getTestServer();
            const token = await getAdminToken();

            const response = await managementApp.request(
                "/guardian/factors/sms/providers/twilio",
                {
                    method: "GET",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                    },
                },
                env,
            );

            expect(response.status).toBe(200);
            const config = (await response.json()) as { sid?: string; from?: string };

            // Should return empty/undefined values
            expect(config.sid).toBeUndefined();
            expect(config.from).toBeUndefined();
        });
    });

    describe("PUT /api/v2/guardian/factors/sms/providers/twilio", () => {
        it("should configure Twilio provider", async () => {
            const { managementApp, env } = await getTestServer();
            const token = await getAdminToken();

            // Configure Twilio
            const updateResponse = await managementApp.request(
                "/guardian/factors/sms/providers/twilio",
                {
                    method: "PUT",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        sid: "AC1234567890",
                        auth_token: "mysecrettoken",
                        from: "+15551234567",
                    }),
                },
                env,
            );

            expect(updateResponse.status).toBe(200);
            const updatedConfig = await updateResponse.json();

            expect(updatedConfig).toHaveProperty("sid", "AC1234567890");
            expect(updatedConfig).toHaveProperty("from", "+15551234567");
            // Auth token should be masked
            expect(updatedConfig).toHaveProperty("auth_token", "********");

            // Verify by retrieving
            const getResponse = await managementApp.request(
                "/guardian/factors/sms/providers/twilio",
                {
                    method: "GET",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                    },
                },
                env,
            );

            expect(getResponse.status).toBe(200);
            const retrievedConfig = await getResponse.json();
            expect(retrievedConfig).toHaveProperty("sid", "AC1234567890");
            expect(retrievedConfig).toHaveProperty("from", "+15551234567");
            expect(retrievedConfig).toHaveProperty("auth_token", "********");
        });

        it("should not overwrite auth_token when sending masked value", async () => {
            const { managementApp, env } = await getTestServer();
            const token = await getAdminToken();

            // First, configure with a real token
            await managementApp.request(
                "/guardian/factors/sms/providers/twilio",
                {
                    method: "PUT",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        sid: "AC9876543210",
                        auth_token: "originaltoken",
                        from: "+15551234567",
                    }),
                },
                env,
            );

            // Update only the `from` number, sending masked auth_token
            const updateResponse = await managementApp.request(
                "/guardian/factors/sms/providers/twilio",
                {
                    method: "PUT",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        from: "+15559876543",
                        auth_token: "********",
                    }),
                },
                env,
            );

            expect(updateResponse.status).toBe(200);
            const updatedConfig = await updateResponse.json();
            expect(updatedConfig).toHaveProperty("from", "+15559876543");
            // Auth token should still be present (masked)
            expect(updatedConfig).toHaveProperty("auth_token", "********");

            // Verify the original token wasn't overwritten by checking the stored tenant data
            const tenantData = await env.data.tenants.get("tenantId");
            expect(tenantData?.mfa?.twilio?.auth_token).toBe("originaltoken");
        });
    });

    describe("GET /api/v2/guardian/factors/phone/message-types", () => {
        it("should return available message types", async () => {
            const { managementApp, env } = await getTestServer();
            const token = await getAdminToken();

            const response = await managementApp.request(
                "/guardian/factors/phone/message-types",
                {
                    method: "GET",
                    headers: {
                        "tenant-id": "tenantId",
                        authorization: `Bearer ${token}`,
                    },
                },
                env,
            );

            expect(response.status).toBe(200);
            const messageTypes = await response.json();

            expect(messageTypes).toBeInstanceOf(Array);
            expect(messageTypes).toHaveLength(1);
            expect((messageTypes as { message_type: string }[])[0]).toHaveProperty("message_type", "sms");
        });
    });
});
