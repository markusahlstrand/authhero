import { GitHub } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { getAuthUrl } from "../variables";
import { GitHubLogo } from "./social-strategies";

export const displayName = "GitHub";
export const logo = GitHubLogo;

export async function getRedirect(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
) {
  const { options } = connection;

  if (!options?.client_id || !options.client_secret) {
    throw new Error("Missing required GitHub authentication parameters");
  }

  const callbackUrl = `${getAuthUrl(ctx.env)}callback`;

  const github = new GitHub(
    options.client_id,
    options.client_secret,
    callbackUrl,
  );

  const code = nanoid();

  const authorizationUrl = github.createAuthorizationURL(
    code,
    options.scope?.split(" ") || ["user:email"],
  );

  return {
    redirectUrl: authorizationUrl.href,
    code,
  };
}

export async function validateAuthorizationCodeAndGetUser(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
  code: string,
) {
  const { options } = connection;

  if (!options?.client_id || !options.client_secret) {
    throw new Error("Missing required authentication parameters");
  }

  const github = new GitHub(
    options.client_id,
    options.client_secret,
    `${getAuthUrl(ctx.env)}callback`,
  );

  const tokens = await github.validateAuthorizationCode(code);

  // Get user profile
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokens.accessToken()}`,
      "User-Agent": "AuthHero",
    },
  });

  if (!userResponse.ok) {
    throw new Error("Failed to fetch user info");
  }

  const user = await userResponse.json();

  // Get user emails (needed since email might not be public)
  const emailsResponse = await fetch("https://api.github.com/user/emails", {
    headers: {
      Authorization: `Bearer ${tokens.accessToken()}`,
      "User-Agent": "AuthHero",
    },
  });

  let email = user.email;

  if (emailsResponse.ok) {
    const emails = await emailsResponse.json();
    // Find primary verified email
    const primaryEmail =
      emails.find((e: any) => e.primary && e.verified) ||
      emails.find((e: any) => e.verified);

    if (primaryEmail) {
      email = primaryEmail.email;
    }
  }

  ctx.set("log", `GitHub user: ${JSON.stringify(user)}`);

  return {
    sub: user.id.toString(),
    email: email,
    name: user.name,
    given_name: user.name?.split(" ")[0],
    family_name: user.name?.split(" ").slice(1).join(" "),
    picture: user.avatar_url,
  };
}
