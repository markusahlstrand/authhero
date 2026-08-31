import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { AuditEventInsert, OutboxAdapter } from "@authhero/adapter-interfaces";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

// Audit events are written to the outbox and consumed from there by the relay,
// so intercept them at `create` — that payload is exactly what every
// destination (logs, log streams, webhooks, the archive) ends up seeing.
function captureAuditEvents(outbox: OutboxAdapter): AuditEventInsert[] {
  const events: AuditEventInsert[] = [];
  const create = outbox.create.bind(outbox);
  outbox.create = async (tenantId, event) => {
    events.push(event);
    return create(tenantId, event);
  };
  return events;
}

describe("management-api audit entity state", () => {
  it("records before/after/diff for a branding update", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.branding.set("tenantId", {
      logo_url: "https://example.com/old-logo.png",
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient.branding.$patch(
      {
        header: { "tenant-id": "tenantId" },
        json: { logo_url: "https://example.com/new-logo.png" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "branding");
    expect(event).toBeDefined();
    expect(event?.target.before?.logo_url).toBe(
      "https://example.com/old-logo.png",
    );
    expect(event?.target.after?.logo_url).toBe(
      "https://example.com/new-logo.png",
    );
    expect(event?.target.diff?.logo_url).toEqual({
      old: "https://example.com/old-logo.png",
      new: "https://example.com/new-logo.png",
    });
  });

  it("records only an after state when branding had no prior row", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient.branding.$patch(
      {
        header: { "tenant-id": "tenantId" },
        json: { logo_url: "https://example.com/first-logo.png" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "branding");
    expect(event?.target.before).toBeUndefined();
    expect(event?.target.after?.logo_url).toBe(
      "https://example.com/first-logo.png",
    );
  });

  it("records before/after/diff for a prompt-settings update", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.promptSettings.set("tenantId", {
      identifier_first: false,
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient.prompts.$patch(
      {
        header: { "tenant-id": "tenantId" },
        json: { identifier_first: true },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "prompt_settings");
    expect(event).toBeDefined();
    expect(event?.target.before?.identifier_first).toBe(false);
    expect(event?.target.after?.identifier_first).toBe(true);
    expect(event?.target.diff?.identifier_first).toEqual({
      old: false,
      new: true,
    });
  });

  it("records before/after/diff for a custom-text update", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.customText.set("tenantId", "login", "en", {
      login: { pageTitle: "Old title" },
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient.prompts[":prompt"]["custom-text"][
      ":language"
    ].$put(
      {
        header: { "tenant-id": "tenantId" },
        param: { prompt: "login", language: "en" },
        json: { login: { pageTitle: "New title" } },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
      },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "custom_text");
    expect(event?.target.before?.login).toEqual({ pageTitle: "Old title" });
    expect(event?.target.after?.login).toEqual({ pageTitle: "New title" });
    expect(event?.target.diff?.login).toEqual({
      old: { pageTitle: "Old title" },
      new: { pageTitle: "New title" },
    });
  });

  it("records the deleted universal-login template as the before state", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.universalLoginTemplates.set("tenantId", {
      body: "<html>{%- auth0:widget -%}</html>",
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient.branding.templates[
      "universal-login"
    ].$delete(
      { header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(204);

    // A delete has no after state, so consumers read the before state.
    const event = events.find(
      (e) => e.target.type === "universal_login_template",
    );
    expect(event?.target.before?.body).toBe(
      "<html>{%- auth0:widget -%}</html>",
    );
    expect(event?.target.after).toBeUndefined();
  });
});
