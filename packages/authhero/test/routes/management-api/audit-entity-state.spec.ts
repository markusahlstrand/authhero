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

  it("records before/after/diff for a role update", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const role = await env.data.roles.create("tenantId", {
      name: "auditor",
      description: "Old description",
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient.roles[":id"].$patch(
      {
        header: { "tenant-id": "tenantId" },
        param: { id: role.id },
        json: { description: "New description" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "role");
    expect(event?.target.before?.description).toBe("Old description");
    expect(event?.target.after?.description).toBe("New description");
    expect(event?.target.diff?.description).toEqual({
      old: "Old description",
      new: "New description",
    });
  });

  it("records the deleted role as the before state", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const role = await env.data.roles.create("tenantId", {
      name: "auditor",
      description: "To be removed",
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient.roles[":id"].$delete(
      { header: { "tenant-id": "tenantId" }, param: { id: role.id } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "role");
    expect(event?.target.before?.name).toBe("auditor");
    expect(event?.target.after).toBeUndefined();
  });

  it("records before/after/diff for a hook update", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const hook = await env.data.hooks.create("tenantId", {
      url: "https://example.com/old-hook",
      trigger_id: "post-user-registration",
      enabled: true,
      synchronous: false,
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient.hooks[":hook_id"].$patch(
      {
        header: { "tenant-id": "tenantId" },
        param: { hook_id: hook.hook_id },
        json: { url: "https://example.com/new-hook" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "hook");
    expect(event?.target.before?.url).toBe("https://example.com/old-hook");
    expect(event?.target.after?.url).toBe("https://example.com/new-hook");
    expect(event?.target.diff?.url).toEqual({
      old: "https://example.com/old-hook",
      new: "https://example.com/new-hook",
    });
  });

  it("records the deleted hook as the before state", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const hook = await env.data.hooks.create("tenantId", {
      url: "https://example.com/doomed-hook",
      trigger_id: "post-user-registration",
      enabled: true,
      synchronous: false,
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient.hooks[":hook_id"].$delete(
      { header: { "tenant-id": "tenantId" }, param: { hook_id: hook.hook_id } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "hook");
    expect(event?.target.before?.url).toBe("https://example.com/doomed-hook");
    expect(event?.target.after).toBeUndefined();
  });

  it("records before/after/diff for a log-stream update", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const stream = await env.data.logStreams!.create("tenantId", {
      name: "loki",
      type: "http",
      status: "active",
      sink: {
        http_endpoint: "https://logs.example.com",
        http_content_type: "application/json",
        http_content_format: "JSONLINES",
        http_authorization: "Bearer x",
      },
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient["log-streams"][":id"].$patch(
      {
        header: { "tenant-id": "tenantId" },
        param: { id: stream.id },
        json: { status: "paused" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "log_stream");
    expect(event?.target.before?.status).toBe("active");
    expect(event?.target.after?.status).toBe("paused");
    expect(event?.target.diff?.status).toEqual({
      old: "active",
      new: "paused",
    });
  });

  it("records the deleted log stream as the before state", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const stream = await env.data.logStreams!.create("tenantId", {
      name: "loki",
      type: "http",
      status: "active",
      sink: {
        http_endpoint: "https://logs.example.com",
        http_content_type: "application/json",
        http_content_format: "JSONLINES",
        http_authorization: "Bearer x",
      },
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient["log-streams"][":id"].$delete(
      { header: { "tenant-id": "tenantId" }, param: { id: stream.id } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(204);

    const event = events.find((e) => e.target.type === "log_stream");
    expect(event?.target.before?.name).toBe("loki");
    expect(event?.target.after).toBeUndefined();
  });

  it("redacts the log stream sink credential from the entity state", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const stream = await env.data.logStreams!.create("tenantId", {
      name: "loki",
      type: "http",
      status: "active",
      sink: {
        http_endpoint: "https://logs.example.com",
        http_authorization: "Bearer super-secret",
      },
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient["log-streams"][":id"].$patch(
      {
        header: { "tenant-id": "tenantId" },
        param: { id: stream.id },
        json: { status: "paused" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    // The credential lives one level down, under `sink` — redaction has to
    // recurse or the bearer token rides along into every audit destination.
    const event = events.find((e) => e.target.type === "log_stream");
    expect(event?.target.before).toMatchObject({
      sink: { http_authorization: "[REDACTED]" },
    });
    expect(event?.target.after).toMatchObject({
      sink: {
        http_authorization: "[REDACTED]",
        // Non-sensitive sink fields survive so the audit trail stays useful.
        http_endpoint: "https://logs.example.com",
      },
    });
  });

  it("records only an after state when an email template is created", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient["email-templates"].$post(
      {
        header: { "tenant-id": "tenantId" },
        json: {
          template: "welcome_email",
          body: "Welcome!",
          from: "hello@example.com",
          subject: "Welcome",
          syntax: "liquid",
          includeEmailInRedirect: false,
          enabled: true,
        },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(201);

    const event = events.find((e) => e.target.type === "email_template");
    expect(event?.target.before).toBeUndefined();
    expect(event?.target.after?.subject).toBe("Welcome");
  });

  it("records before/after/diff for an email-template upsert over an existing row", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.emailTemplates.create("tenantId", {
      template: "welcome_email",
      body: "Old body",
      from: "hello@example.com",
      subject: "Old subject",
      syntax: "liquid",
      includeEmailInRedirect: false,
      enabled: true,
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient["email-templates"][
      ":templateName"
    ].$put(
      {
        header: { "tenant-id": "tenantId" },
        param: { templateName: "welcome_email" },
        json: {
          template: "welcome_email",
          body: "New body",
          from: "hello@example.com",
          subject: "New subject",
          syntax: "liquid",
          includeEmailInRedirect: false,
          enabled: true,
        },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "email_template");
    expect(event?.target.before?.subject).toBe("Old subject");
    expect(event?.target.after?.subject).toBe("New subject");
    expect(event?.target.diff?.subject).toEqual({
      old: "Old subject",
      new: "New subject",
    });
  });

  it("records before/after/diff for an email-template patch", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.emailTemplates.create("tenantId", {
      template: "welcome_email",
      body: "Old body",
      from: "hello@example.com",
      subject: "Old subject",
      syntax: "liquid",
      includeEmailInRedirect: false,
      enabled: true,
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient["email-templates"][
      ":templateName"
    ].$patch(
      {
        header: { "tenant-id": "tenantId" },
        param: { templateName: "welcome_email" },
        json: { subject: "Patched subject" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "email_template");
    expect(event?.target.before?.subject).toBe("Old subject");
    expect(event?.target.after?.subject).toBe("Patched subject");
    expect(event?.target.diff?.subject).toEqual({
      old: "Old subject",
      new: "Patched subject",
    });
  });

  it("records the deleted email template as the before state", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.emailTemplates.create("tenantId", {
      template: "welcome_email",
      body: "Doomed body",
      from: "hello@example.com",
      subject: "Doomed subject",
      syntax: "liquid",
      includeEmailInRedirect: false,
      enabled: true,
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient["email-templates"][
      ":templateName"
    ].$delete(
      {
        header: { "tenant-id": "tenantId" },
        param: { templateName: "welcome_email" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(204);

    const event = events.find((e) => e.target.type === "email_template");
    expect(event?.target.before?.subject).toBe("Doomed subject");
    expect(event?.target.after).toBeUndefined();
  });

  it("records before/after/diff for a form update", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const form = await env.data.forms.create("tenantId", {
      name: "Old form name",
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient.forms[":id"].$patch(
      {
        header: { "tenant-id": "tenantId" },
        param: { id: form.id },
        json: { name: "New form name" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "form");
    expect(event?.target.before?.name).toBe("Old form name");
    expect(event?.target.after?.name).toBe("New form name");
    expect(event?.target.diff?.name).toEqual({
      old: "Old form name",
      new: "New form name",
    });
  });

  it("records the deleted form as the before state", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const form = await env.data.forms.create("tenantId", {
      name: "Doomed form",
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient.forms[":id"].$delete(
      { header: { "tenant-id": "tenantId" }, param: { id: form.id } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "form");
    expect(event?.target.before?.name).toBe("Doomed form");
    expect(event?.target.after).toBeUndefined();
  });

  it("records before/after/diff for a flow update", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const flow = await env.data.flows.create("tenantId", {
      name: "Old flow name",
      actions: [],
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient.flows[":id"].$patch(
      {
        header: { "tenant-id": "tenantId" },
        param: { id: flow.id },
        json: { name: "New flow name" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "flow");
    expect(event?.target.before?.name).toBe("Old flow name");
    expect(event?.target.after?.name).toBe("New flow name");
    expect(event?.target.diff?.name).toEqual({
      old: "Old flow name",
      new: "New flow name",
    });
  });

  it("records the deleted flow as the before state", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const flow = await env.data.flows.create("tenantId", {
      name: "Doomed flow",
      actions: [],
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient.flows[":id"].$delete(
      { header: { "tenant-id": "tenantId" }, param: { id: flow.id } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "flow");
    expect(event?.target.before?.name).toBe("Doomed flow");
    expect(event?.target.after).toBeUndefined();
  });

  it("records before/after/diff for a custom-domain update", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const customDomain = await env.data.customDomains.create("tenantId", {
      domain: "auth.example.com",
      type: "auth0_managed_certs",
      tls_policy: "recommended",
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient["custom-domains"][":id"].$patch(
      {
        header: { "tenant-id": "tenantId" },
        param: { id: customDomain.custom_domain_id },
        json: { custom_client_ip_header: "cf-connecting-ip" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "custom_domain");
    expect(event?.target.before?.domain).toBe("auth.example.com");
    expect(event?.target.after?.custom_client_ip_header).toBe(
      "cf-connecting-ip",
    );
    expect(event?.target.diff?.custom_client_ip_header?.new).toBe(
      "cf-connecting-ip",
    );
  });

  it("records the deleted custom domain as the before state", async () => {
    const { managementApp, env } = await getTestServer({ outbox: true });
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const customDomain = await env.data.customDomains.create("tenantId", {
      domain: "doomed.example.com",
      type: "auth0_managed_certs",
    });

    const events = captureAuditEvents(env.data.outbox!);

    const response = await managementClient["custom-domains"][":id"].$delete(
      {
        header: { "tenant-id": "tenantId" },
        param: { id: customDomain.custom_domain_id },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);

    const event = events.find((e) => e.target.type === "custom_domain");
    expect(event?.target.before?.domain).toBe("doomed.example.com");
    expect(event?.target.after).toBeUndefined();
  });
});
