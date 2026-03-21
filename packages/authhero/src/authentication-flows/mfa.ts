import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  LoginSession,
  MfaEnrollment,
  Strategy,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { EnrichedClient } from "../helpers/client";
import generateOTP from "../utils/otp";

const MFA_OTP_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes

export type MfaCheckResult =
  | { required: false }
  | { required: true; enrolled: false }
  | { required: true; enrolled: true; enrollment: MfaEnrollment };

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

  // Check if SMS factor is enabled
  if (!tenant.mfa?.factors?.sms) {
    return { required: false };
  }

  // Look up user's confirmed MFA enrollments
  const enrollments = await ctx.env.data.mfaEnrollments.list(tenantId, userId);
  const confirmedPhoneEnrollment = enrollments.find(
    (e) => e.type === "phone" && e.confirmed,
  );

  if (confirmedPhoneEnrollment) {
    return { required: true, enrolled: true, enrollment: confirmedPhoneEnrollment };
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

  // Store the OTP code
  await ctx.env.data.codes.create(tenant.id, {
    code_id: code,
    code_type: "mfa_otp",
    login_id: loginSession.id,
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
  const storedCode = await ctx.env.data.codes.get(
    tenantId,
    submittedCode,
    "mfa_otp",
  );

  if (!storedCode) {
    return false;
  }

  // Check if code is expired
  if (new Date(storedCode.expires_at) < new Date()) {
    return false;
  }

  // Check if code was already used
  if (storedCode.used_at) {
    return false;
  }

  // Check if code belongs to the correct login session
  if (storedCode.login_id !== loginSessionId) {
    return false;
  }

  // Mark as used
  await ctx.env.data.codes.used(tenantId, submittedCode);

  return true;
}
