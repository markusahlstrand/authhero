import { GitHub } from "arctic";
import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../types";
import { getAuthUrl } from "../variables";

export const displayName = "GitHub";

export const logoDataUri =
  "data:image/svg+xml,%3Csvg%20width%3D%2245%22%20height%3D%2245%22%20viewBox%3D%220%200%2045%2045%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20clip-rule%3D%22evenodd%22%20d%3D%22M22.5%200C10.074%200%200%2010.335%200%2023.077C0%2033.266%206.444%2041.895%2015.39%2044.955C16.515%2045.165%2016.935%2044.46%2016.935%2043.857C16.935%2043.32%2016.92%2041.865%2016.905%2039.99C10.65%2041.355%209.33%2036.99%209.33%2036.99C8.31%2034.32%206.825%2033.615%206.825%2033.615C4.77%2032.205%206.975%2032.235%206.975%2032.235C9.24%2032.385%2010.425%2034.59%2010.425%2034.59C12.45%2038.13%2015.75%2037.125%2017.01%2036.555C17.22%2035.07%2017.82%2034.065%2018.48%2033.51C13.455%2032.94%208.19%2030.93%208.19%2022.035C8.19%2019.5%209.075%2017.43%2010.47%2015.81C10.23%2015.24%209.435%2012.87%2010.695%209.66C10.695%209.66%2012.585%209.045%2016.875%2012.06C18.675%2011.565%2020.595%2011.31%2022.5%2011.31C24.405%2011.31%2026.325%2011.565%2028.125%2012.06C32.415%209.045%2034.305%209.66%2034.305%209.66C35.565%2012.87%2034.77%2015.24%2034.53%2015.81C35.925%2017.43%2036.81%2019.5%2036.81%2022.035C36.81%2030.96%2031.53%2032.925%2026.49%2033.48C27.33%2034.2%2028.095%2035.625%2028.095%2037.815C28.095%2040.95%2028.065%2043.47%2028.065%2043.857C28.065%2044.46%2028.485%2045.18%2029.625%2044.955C38.571%2041.88%2045%2033.252%2045%2023.077C45%2010.335%2034.926%200%2022.5%200Z%22%20fill%3D%22%23181717%22%2F%3E%3C%2Fsvg%3E";

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
