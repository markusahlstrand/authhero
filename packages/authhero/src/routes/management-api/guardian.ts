import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";

// Auth0-compatible Guardian MFA factor types
const factorNames = [
    "sms",
    "otp",
    "email",
    "push-notification",
    "webauthn-roaming",
    "webauthn-platform",
    "recovery-code",
    "duo",
] as const;

type FactorName = (typeof factorNames)[number];

// Map between Auth0 API factor names and internal storage keys
function toInternalKey(factorName: FactorName): string {
    return factorName.replace(/-/g, "_");
}

// Schema for factor response (Auth0-compatible)
const factorSchema = z.object({
    name: z.enum(factorNames),
    enabled: z.boolean(),
    trial_expired: z.boolean().optional(),
});

// Schema for list of factors
const factorsListSchema = z.array(factorSchema);

// Schema for enabling/disabling a factor
const updateFactorSchema = z.object({
    enabled: z.boolean(),
});

// Schema for SMS provider selection
const smsSelectedProviderSchema = z.object({
    provider: z.enum(["twilio", "vonage", "aws_sns", "phone_message_hook"]),
});

// Schema for Twilio provider configuration
const twilioProviderSchema = z.object({
    sid: z.string().optional(),
    auth_token: z.string().optional(),
    from: z.string().optional(),
    messaging_service_sid: z.string().optional(),
});

// Schema for message types
const messageTypeSchema = z.object({
    message_type: z.enum(["sms", "voice"]),
});

export const guardianRoutes = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
}>()
    // --------------------------------
    // GET /api/v2/guardian/factors
    // --------------------------------
    .openapi(
        createRoute({
            tags: ["guardian"],
            method: "get",
            path: "/factors",
            request: {
                headers: z.object({
                    "tenant-id": z.string().optional(),
                }),
            },
            security: [
                {
                    Bearer: ["read:guardian_factors", "auth:read"],
                },
            ],
            responses: {
                200: {
                    content: {
                        "application/json": {
                            schema: factorsListSchema,
                        },
                    },
                    description: "List of MFA factors",
                },
            },
        }),
        async (ctx) => {
            const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
            const factors = tenant?.mfa?.factors;

            // Return all factors with their current state
            const result = factorNames.map((name) => {
                const internalKey = toInternalKey(name) as keyof NonNullable<
                    typeof factors
                >;
                return {
                    name,
                    enabled: Boolean(factors?.[internalKey]),
                    trial_expired: false,
                };
            });

            return ctx.json(result);
        },
    )
    // --------------------------------
    // SPECIFIC ROUTES MUST COME BEFORE PARAMETERIZED ROUTES
    // --------------------------------
    // GET /api/v2/guardian/factors/sms/selected-provider
    // --------------------------------
    .openapi(
        createRoute({
            tags: ["guardian"],
            method: "get",
            path: "/factors/sms/selected-provider",
            request: {
                headers: z.object({
                    "tenant-id": z.string().optional(),
                }),
            },
            security: [
                {
                    Bearer: ["read:guardian_factors", "auth:read"],
                },
            ],
            responses: {
                200: {
                    content: {
                        "application/json": {
                            schema: smsSelectedProviderSchema,
                        },
                    },
                    description: "Selected SMS provider",
                },
            },
        }),
        async (ctx) => {
            const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
            const provider = tenant?.mfa?.sms_provider?.provider || "twilio";

            return ctx.json({ provider });
        },
    )
    // --------------------------------
    // PUT /api/v2/guardian/factors/sms/selected-provider
    // --------------------------------
    .openapi(
        createRoute({
            tags: ["guardian"],
            method: "put",
            path: "/factors/sms/selected-provider",
            request: {
                headers: z.object({
                    "tenant-id": z.string().optional(),
                }),
                body: {
                    content: {
                        "application/json": {
                            schema: smsSelectedProviderSchema,
                        },
                    },
                },
            },
            security: [
                {
                    Bearer: ["update:guardian_factors", "auth:write"],
                },
            ],
            responses: {
                200: {
                    content: {
                        "application/json": {
                            schema: smsSelectedProviderSchema,
                        },
                    },
                    description: "Updated SMS provider selection",
                },
            },
        }),
        async (ctx) => {
            const { provider } = ctx.req.valid("json");

            const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
            if (!tenant) {
                throw new HTTPException(404, { message: "Tenant not found" });
            }

            await ctx.env.data.tenants.update(ctx.var.tenant_id, {
                mfa: {
                    ...tenant.mfa,
                    sms_provider: {
                        provider,
                    },
                },
            });

            return ctx.json({ provider });
        },
    )
    // --------------------------------
    // GET /api/v2/guardian/factors/sms/providers/twilio
    // --------------------------------
    .openapi(
        createRoute({
            tags: ["guardian"],
            method: "get",
            path: "/factors/sms/providers/twilio",
            request: {
                headers: z.object({
                    "tenant-id": z.string().optional(),
                }),
            },
            security: [
                {
                    Bearer: ["read:guardian_factors", "auth:read"],
                },
            ],
            responses: {
                200: {
                    content: {
                        "application/json": {
                            schema: twilioProviderSchema,
                        },
                    },
                    description: "Twilio provider configuration",
                },
            },
        }),
        async (ctx) => {
            const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
            const twilio = tenant?.mfa?.twilio || {};

            // Don't return the auth_token in full for security
            return ctx.json({
                sid: twilio.sid,
                // Mask the auth token if it exists
                auth_token: twilio.auth_token ? "********" : undefined,
                from: twilio.from,
                messaging_service_sid: twilio.messaging_service_sid,
            });
        },
    )
    // --------------------------------
    // PUT /api/v2/guardian/factors/sms/providers/twilio
    // --------------------------------
    .openapi(
        createRoute({
            tags: ["guardian"],
            method: "put",
            path: "/factors/sms/providers/twilio",
            request: {
                headers: z.object({
                    "tenant-id": z.string().optional(),
                }),
                body: {
                    content: {
                        "application/json": {
                            schema: twilioProviderSchema,
                        },
                    },
                },
            },
            security: [
                {
                    Bearer: ["update:guardian_factors", "auth:write"],
                },
            ],
            responses: {
                200: {
                    content: {
                        "application/json": {
                            schema: twilioProviderSchema,
                        },
                    },
                    description: "Updated Twilio configuration",
                },
            },
        }),
        async (ctx) => {
            const twilioConfig = ctx.req.valid("json");

            const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
            if (!tenant) {
                throw new HTTPException(404, { message: "Tenant not found" });
            }

            // Merge with existing config (don't overwrite auth_token if not provided)
            const existingTwilio = tenant.mfa?.twilio || {};
            const updatedTwilio = {
                ...existingTwilio,
                ...twilioConfig,
                // Only update auth_token if a new one is provided (not masked)
                auth_token:
                    twilioConfig.auth_token && twilioConfig.auth_token !== "********"
                        ? twilioConfig.auth_token
                        : existingTwilio.auth_token,
            };

            await ctx.env.data.tenants.update(ctx.var.tenant_id, {
                mfa: {
                    ...tenant.mfa,
                    twilio: updatedTwilio,
                },
            });

            return ctx.json({
                sid: updatedTwilio.sid,
                auth_token: updatedTwilio.auth_token ? "********" : undefined,
                from: updatedTwilio.from,
                messaging_service_sid: updatedTwilio.messaging_service_sid,
            });
        },
    )
    // --------------------------------
    // GET /api/v2/guardian/factors/phone/message-types
    // --------------------------------
    .openapi(
        createRoute({
            tags: ["guardian"],
            method: "get",
            path: "/factors/phone/message-types",
            request: {
                headers: z.object({
                    "tenant-id": z.string().optional(),
                }),
            },
            security: [
                {
                    Bearer: ["read:guardian_factors", "auth:read"],
                },
            ],
            responses: {
                200: {
                    content: {
                        "application/json": {
                            schema: z.array(messageTypeSchema),
                        },
                    },
                    description: "Available message types",
                },
            },
        }),
        async (ctx) => {
            // For now, only SMS is supported
            const result: { message_type: "sms" | "voice" }[] = [
                { message_type: "sms" },
            ];
            return ctx.json(result);
        },
    )
    // --------------------------------
    // PARAMETERIZED ROUTES MUST COME LAST
    // --------------------------------
    // GET /api/v2/guardian/factors/:factor_name
    // --------------------------------
    .openapi(
        createRoute({
            tags: ["guardian"],
            method: "get",
            path: "/factors/{factor_name}",
            request: {
                headers: z.object({
                    "tenant-id": z.string().optional(),
                }),
                params: z.object({
                    factor_name: z.enum(factorNames),
                }),
            },
            security: [
                {
                    Bearer: ["read:guardian_factors", "auth:read"],
                },
            ],
            responses: {
                200: {
                    content: {
                        "application/json": {
                            schema: factorSchema,
                        },
                    },
                    description: "MFA factor details",
                },
            },
        }),
        async (ctx) => {
            const { factor_name } = ctx.req.valid("param");
            const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
            const factors = tenant?.mfa?.factors;
            const internalKey = toInternalKey(factor_name) as keyof NonNullable<
                typeof factors
            >;

            return ctx.json({
                name: factor_name,
                enabled: Boolean(factors?.[internalKey]),
                trial_expired: false,
            });
        },
    )
    // --------------------------------
    // PUT /api/v2/guardian/factors/:factor_name
    // --------------------------------
    .openapi(
        createRoute({
            tags: ["guardian"],
            method: "put",
            path: "/factors/{factor_name}",
            request: {
                headers: z.object({
                    "tenant-id": z.string().optional(),
                }),
                params: z.object({
                    factor_name: z.enum(factorNames),
                }),
                body: {
                    content: {
                        "application/json": {
                            schema: updateFactorSchema,
                        },
                    },
                },
            },
            security: [
                {
                    Bearer: ["update:guardian_factors", "auth:write"],
                },
            ],
            responses: {
                200: {
                    content: {
                        "application/json": {
                            schema: factorSchema,
                        },
                    },
                    description: "Updated MFA factor",
                },
            },
        }),
        async (ctx) => {
            const { factor_name } = ctx.req.valid("param");
            const { enabled } = ctx.req.valid("json");
            const internalKey = toInternalKey(factor_name);

            // Get current tenant
            const tenant = await ctx.env.data.tenants.get(ctx.var.tenant_id);
            if (!tenant) {
                throw new HTTPException(404, { message: "Tenant not found" });
            }

            // Update the factor state - merge with existing factors
            const existingFactors = tenant.mfa?.factors;
            await ctx.env.data.tenants.update(ctx.var.tenant_id, {
                mfa: {
                    ...tenant.mfa,
                    factors: {
                        sms: existingFactors?.sms ?? false,
                        otp: existingFactors?.otp ?? false,
                        email: existingFactors?.email ?? false,
                        push_notification: existingFactors?.push_notification ?? false,
                        webauthn_roaming: existingFactors?.webauthn_roaming ?? false,
                        webauthn_platform: existingFactors?.webauthn_platform ?? false,
                        recovery_code: existingFactors?.recovery_code ?? false,
                        duo: existingFactors?.duo ?? false,
                        [internalKey]: enabled,
                    },
                },
            });

            return ctx.json({
                name: factor_name,
                enabled,
                trial_expired: false,
            });
        },
    );
