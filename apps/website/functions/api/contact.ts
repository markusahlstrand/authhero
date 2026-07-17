// Cloudflare Pages Function: POST /api/contact
// Receives a sales / "talk to us" inquiry and forwards it to Slack. The Slack
// webhook URL is a server-side secret (env.SLACK_WEBHOOK_URL) and is never
// exposed to the browser. Shares the webhook with the early-access endpoint.

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

export const onRequestPost = async (
  context: RequestContext,
): Promise<Response> => {
  const { request, env } = context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const email =
    isRecord(body) && typeof body.email === "string" ? body.email.trim() : "";
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ error: "Please enter a valid email address." }, 400);
  }

  // Optional free-text message and a label for which tier/context triggered it.
  const message =
    isRecord(body) && typeof body.message === "string"
      ? body.message.trim().slice(0, 2000)
      : "";
  const topic =
    isRecord(body) && typeof body.topic === "string"
      ? body.topic.trim().slice(0, 80)
      : "General";

  if (!env.SLACK_WEBHOOK_URL) {
    console.error("SLACK_WEBHOOK_URL is not configured");
    return json(
      { error: "Contact is temporarily unavailable. Please try again later." },
      503,
    );
  }

  const lines = [`:phone: New AuthHero inquiry (${topic}): ${email}`];
  if (message) lines.push(message);

  let slackResponse: Response;
  try {
    slackResponse = await fetch(env.SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n") }),
    });
  } catch (error) {
    console.error(`Slack webhook request failed: ${error}`);
    return json(
      { error: "Could not submit your message. Please try again." },
      502,
    );
  }

  if (!slackResponse.ok) {
    console.error(`Slack webhook failed: ${slackResponse.status}`);
    return json(
      { error: "Could not submit your message. Please try again." },
      502,
    );
  }

  return json({ ok: true });
};
