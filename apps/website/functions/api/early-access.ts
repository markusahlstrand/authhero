// Cloudflare Pages Function: POST /api/early-access
// Receives an email from the early-access dialog and forwards it to Slack.
// The Slack webhook URL is a server-side secret (env.SLACK_WEBHOOK_URL) and is
// never exposed to the browser.

interface Env {
  SLACK_WEBHOOK_URL?: string;
}

interface RequestContext {
  request: Request;
  env: Env;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

// Pragmatic email check — the real validation is that Slack gets a usable string.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const onRequestPost = async (context: RequestContext): Promise<Response> => {
  const { request, env } = context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const email = isRecord(body) && typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: "Please enter a valid email address." }, 400);
  }

  if (!env.SLACK_WEBHOOK_URL) {
    console.error("SLACK_WEBHOOK_URL is not configured");
    return json({ error: "Signups are temporarily unavailable. Please try again later." }, 503);
  }

  const slackResponse = await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: `:rocket: New AuthHero early access request: ${email}`,
    }),
  });

  if (!slackResponse.ok) {
    console.error(`Slack webhook failed: ${slackResponse.status}`);
    return json({ error: "Could not submit your request. Please try again." }, 502);
  }

  return json({ ok: true });
};
