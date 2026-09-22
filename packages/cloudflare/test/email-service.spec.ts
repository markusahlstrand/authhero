import { describe, expect, it } from "vitest";
import type { EmailServiceSendParams } from "@authhero/adapter-interfaces";
import {
  createCloudflareEmailService,
  type CloudflareEmailMessage,
  type CloudflareSendEmailBinding,
} from "../src/email-service";

const makeBinding = (
  throws?: unknown,
): CloudflareSendEmailBinding & { calls: CloudflareEmailMessage[] } => {
  const calls: CloudflareEmailMessage[] = [];
  return {
    calls,
    async send(message) {
      calls.push(message);
      if (throws !== undefined) {
        throw throws;
      }
      return { messageId: "msg_123" };
    },
  };
};

const baseParams = (
  overrides: Partial<EmailServiceSendParams> = {},
): EmailServiceSendParams => ({
  emailProvider: { name: "cloudflare", enabled: true, credentials: {} },
  to: "user@example.com",
  from: "login@auth.example.com",
  subject: "Your code",
  html: "<p>123456</p>",
  text: "123456",
  template: "auth-code",
  data: {},
  ...overrides,
});

describe("Cloudflare Email Sending service", () => {
  it("sends html and text bodies through the binding", async () => {
    const binding = makeBinding();
    const service = createCloudflareEmailService({ binding });

    await service.send(baseParams());

    expect(binding.calls).toEqual([
      {
        to: "user@example.com",
        from: "login@auth.example.com",
        subject: "Your code",
        html: "<p>123456</p>",
        text: "123456",
      },
    ]);
  });

  it("omits empty bodies", async () => {
    const binding = makeBinding();
    const service = createCloudflareEmailService({ binding });

    await service.send(baseParams({ html: undefined, text: "only text" }));

    expect(binding.calls[0]).not.toHaveProperty("html");
    expect(binding.calls[0]?.text).toBe("only text");
  });

  it("uses the configured from-address over the one AuthHero resolves", async () => {
    const binding = makeBinding();
    const service = createCloudflareEmailService({
      binding,
      from: { email: "no-reply@verified.example.com", name: "Acme" },
    });

    await service.send(baseParams());

    expect(binding.calls[0]?.from).toEqual({
      email: "no-reply@verified.example.com",
      name: "Acme",
    });
  });

  it("splits a `Name <address>` sender into an address object", async () => {
    const binding = makeBinding();
    const service = createCloudflareEmailService({ binding });

    await service.send(baseParams({ from: '"Acme Login" <login@acme.com>' }));

    expect(binding.calls[0]?.from).toEqual({
      email: "login@acme.com",
      name: "Acme Login",
    });
  });

  it("passes configured reply-to and headers", async () => {
    const binding = makeBinding();
    const service = createCloudflareEmailService({
      binding,
      replyTo: "support@example.com",
      headers: { "X-Tenant": "acme" },
    });

    await service.send(baseParams());

    expect(binding.calls[0]?.replyTo).toBe("support@example.com");
    expect(binding.calls[0]?.headers).toEqual({ "X-Tenant": "acme" });
  });

  it("surfaces binding errors with their code", async () => {
    const bindingError = Object.assign(new Error("sender not verified"), {
      code: "E_SENDER_NOT_VERIFIED",
    });
    const binding = makeBinding(bindingError);
    const service = createCloudflareEmailService({ binding });

    const result = service.send(baseParams());

    await expect(result).rejects.toThrow(
      "Cloudflare Email Sending failed: E_SENDER_NOT_VERIFIED: sender not verified",
    );
    await expect(result).rejects.toMatchObject({ cause: bindingError });
  });
});
