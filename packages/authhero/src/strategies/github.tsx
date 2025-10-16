import { GitHub } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { getAuthUrl } from "../variables";
import type { FC } from "hono/jsx";

export const displayName = "GitHub";

export const logo: FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    width="45"
    height="45"
    viewBox="0 0 45 45"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M22.5 0C10.074 0 0 10.335 0 23.077C0 33.266 6.444 41.895 15.39 44.955C16.515 45.165 16.935 44.46 16.935 43.857C16.935 43.32 16.92 41.865 16.905 39.99C10.65 41.355 9.33 36.99 9.33 36.99C8.31 34.32 6.825 33.615 6.825 33.615C4.77 32.205 6.975 32.235 6.975 32.235C9.24 32.385 10.425 34.59 10.425 34.59C12.45 38.13 15.75 37.125 17.01 36.555C17.22 35.07 17.82 34.065 18.48 33.51C13.455 32.94 8.19 30.93 8.19 22.035C8.19 19.5 9.075 17.43 10.47 15.81C10.23 15.24 9.435 12.87 10.695 9.66C10.695 9.66 12.585 9.045 16.875 12.06C18.675 11.565 20.595 11.31 22.5 11.31C24.405 11.31 26.325 11.565 28.125 12.06C32.415 9.045 34.305 9.66 34.305 9.66C35.565 12.87 34.77 15.24 34.53 15.81C35.925 17.43 36.81 19.5 36.81 22.035C36.81 30.96 31.53 32.925 26.49 33.48C27.33 34.2 28.095 35.625 28.095 37.815C28.095 40.95 28.065 43.47 28.065 43.857C28.065 44.46 28.485 45.18 29.625 44.955C38.571 41.88 45 33.252 45 23.077C45 10.335 34.926 0 22.5 0Z"
      fill="currentColor"
    />
  </svg>
);

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
