import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  LoginSession,
  LogTypes,
  MfaEnrollment,
  Strategy,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { EnrichedClient } from "../helpers/client";
import generateOTP from "../utils/otp";
import { logMessage } from "../helpers/logging";
import { TOTPController } from "oslo/otp";
import { createTOTPKeyURI } from "oslo/otp";
import { base32 } from "oslo/encoding";

const MFA_OTP_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes

export type MfaCheckResult =
  | { required: false }
  | { required: true; enrolled: false }
  | {
      required: true;
      enrolled: true;
      enrollment: MfaEnrollment;
      allEnrollments: MfaEnrollment[];
    };

/**
 * Check if MFA is required for a user based on tenant policy and enrollment status.
 */
export async function checkMfaRequired(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  userId: string,
): Promise<MfaCheckResult> {
  const tenant = await ctx.env.data.tenants.get(tenantId);
  if (!tenant) {
    return { required: false };
  }

  // Check MFA policy
  const policy = tenant.mfa?.policy;
  if (!policy || policy === "never") {
    return { required: false };
  }

  // Validate that at least one supported factor is enabled
  const hasSupportedFactor =
    tenant.mfa?.factors?.sms === true || tenant.mfa?.factors?.otp === true;

  if (!hasSupportedFactor) {
    throw new HTTPException(500, {
      message:
        "MFA policy requires MFA but no supported factors are enabled. Enable at least one factor (e.g. SMS or OTP) in the tenant MFA configuration.",
    });
  }

  // Look up user's confirmed MFA enrollments
  const enrollments = await ctx.env.data.mfaEnrollments.list(tenantId, userId);
  const confirmedEnrollments = enrollments.filter(
    (e) => (e.type === "phone" || e.type === "totp") && e.confirmed,
  );

  if (confirmedEnrollments.length > 0) {
    return {
      required: true,
      enrolled: true,
      enrollment: confirmedEnrollments[0]!,
      allEnrollments: confirmedEnrollments,
    };
  }

  return { required: true, enrolled: false };
}

/**
 * Send an MFA OTP code via SMS using the tenant's configured SMS provider.
 */
export async function sendMfaOtp(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: EnrichedClient,
  loginSession: LoginSession,
  phoneNumber: string,
): Promise<void> {
  const tenant = client.tenant;
  const code = generateOTP();
  const codeId = `mfa:${loginSession.id}`;

  // Remove any existing MFA OTP code for this session before creating a new one
  await ctx.env.data.codes.remove(tenant.id, codeId);

  // Store the OTP code with a deterministic code_id, keeping the OTP in a separate field
  await ctx.env.data.codes.create(tenant.id, {
    code_id: codeId,
    code_type: "mfa_otp",
    login_id: loginSession.id,
    otp: code,
    expires_at: new Date(Date.now() + MFA_OTP_EXPIRATION_MS).toISOString(),
  });

  // Find SMS provider from the SMS connection or use tenant MFA config
  const smsConnection = client.connections.find(
    (c) => c.strategy === Strategy.SMS,
  );

  const provider =
    tenant.mfa?.sms_provider?.provider ||
    smsConnection?.options?.provider ||
    "twilio";

  const smsService = ctx.env.smsProviders?.[provider];
  if (!smsService) {
    throw new HTTPException(500, {
      message: `SMS provider '${provider}' not configured`,
    });
  }

  // Use connection options if available, otherwise use tenant MFA config
  const options = smsConnection?.options || tenant.mfa?.twilio || {};

  try {
    await smsService({
      options,
      to: phoneNumber,
      from: tenant.friendly_name,
      text: `Your verification code is: ${code}`,
      template: "mfa-code",
      data: {
        code,
        tenantName: tenant.friendly_name || "",
        tenantId: tenant.id,
      },
    });

    logMessage(ctx, tenant.id, {
      type: LogTypes.MFA_SMS_SENT,
      description: "MFA SMS sent",
    });
  } catch (err) {
    logMessage(ctx, tenant.id, {
      type: LogTypes.ERROR_SENDING_MFA_SMS,
      description: `Failed to send MFA SMS: ${err instanceof Error ? err.message : String(err)}`,
    });
    throw err;
  }
}

/**
 * Verify an MFA OTP code against the stored code.
 * Returns true if valid, false otherwise.
 */
export async function verifyMfaOtp(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  loginSessionId: string,
  submittedCode: string,
): Promise<boolean> {
  const codeId = `mfa:${loginSessionId}`;
  const storedCode = await ctx.env.data.codes.get(tenantId, codeId, "mfa_otp");

  if (!storedCode) {
    return false;
  }

  // Check if code is expired
  if (new Date(storedCode.expires_at) < new Date()) {
    return false;
  }

  // Compare the submitted OTP against the stored value
  if (storedCode.otp !== submittedCode) {
    return false;
  }

  // Atomically mark as used only if not already consumed (prevents race conditions)
  const consumed = await ctx.env.data.codes.consume(tenantId, codeId);

  return consumed;
}

const TOTP_SECRET_BYTES = 20;
const totpController = new TOTPController();

/**
 * Generate a random TOTP secret and return it as a base32-encoded string.
 */
export function generateTotpSecret(): string {
  const secret = new Uint8Array(TOTP_SECRET_BYTES);
  crypto.getRandomValues(secret);
  return base32.encode(secret, { includePadding: false });
}

/**
 * Create an otpauth:// URI for enrolling in TOTP (used for QR code generation).
 */
export function createTotpUri(
  issuer: string,
  accountName: string,
  secretBase32: string,
): string {
  const secretBytes = base32.decode(secretBase32, { strict: false });
  return createTOTPKeyURI(issuer, accountName, secretBytes);
}

/**
 * Verify a TOTP code against a base32-encoded secret.
 */
export async function verifyTotpCode(
  secretBase32: string,
  code: string,
): Promise<boolean> {
  const secretBytes = base32.decode(secretBase32, { strict: false });
  return totpController.verify(code, secretBytes);
}
