import { TestServer } from "../helpers/test-server";
import { testClient } from "hono/testing";
import {
  AuthorizationResponseType,
  AuthorizationResponseMode,
} from "@authhero/adapter-interfaces";

export interface LoginWithCodeParams {
  redirect_uri?: string;
}

export async function loginWithCode(
  testServer: TestServer,
  params: LoginWithCodeParams = {},
) {
  const { universalApp, oauthApp, env, getSentEmails } = testServer;
  const oauthClient = testClient(oauthApp, env);
  const universalClient = testClient(universalApp, env);

  const authorizeResponse = await oauthClient.authorize.$get({
    query: {
      client_id: "clientId",
      redirect_uri: params.redirect_uri || "https://example.com/callback",
      state: "state",
      nonce: "nonce",
      scope: "openid email profile",
      auth0Client: "eyJuYW1lIjoiYXV0aDAtc3BhLWpzIiwidmVyc2lvbiI6IjIuMS4zIn0=",
      response_type: AuthorizationResponseType.CODE,
      response_mode: AuthorizationResponseMode.QUERY,
    },
  });

  if (authorizeResponse.status !== 302) {
    throw new Error(`Expected status 302, but got ${authorizeResponse.status}`);
  }

  const location = authorizeResponse.headers.get("location");
  const universalUrl = new URL(`https://example.com${location}`);
  const state = universalUrl.searchParams.get("state");
  if (!state) {
    throw new Error("No state found");
  }

  // --------------------------------
  // enter email
  // --------------------------------
  const enterEmailGetResponse = await universalClient.login.identifier.$get({
    query: { state },
  });

  if (enterEmailGetResponse.status !== 200) {
    throw new Error(
      `Expected status 200, but got ${enterEmailGetResponse.status}`,
    );
  }

  const enterEmailPostResponse = await universalClient.login.identifier.$post({
    query: { state },
    form: { username: "foo@example.com" },
  });

  if (enterEmailPostResponse.status !== 302) {
    throw new Error(
      `Expected status 302, but got ${enterEmailPostResponse.status}`,
    );
  }

  // --------------------------------
  // enter correct code
  // --------------------------------
  const enterCodeGetResponse = await universalClient["enter-code"].$get({
    query: { state },
  });

  if (enterCodeGetResponse.status !== 200) {
    throw new Error(
      `Expected status 200, but got ${enterCodeGetResponse.status}`,
    );
  }

  const email = getSentEmails()[0];
  const { code } = email.data;

  const enterCodePostResponse = await universalClient["enter-code"].$post({
    query: { state },
    form: { code },
  });

  if (enterCodePostResponse.status !== 302) {
    console.error(await enterCodePostResponse.text());
    throw new Error(
      `Expected status 302, but got ${enterCodePostResponse.status}`,
    );
  }

  const enterCodeLocation = enterCodePostResponse.headers.get("location");
  if (!enterCodeLocation) {
    throw new Error("No location header found");
  }

  // Get all Set-Cookie headers (Double-Clear returns multiple cookies)
  const setCookieHeader = enterCodePostResponse.headers.get("set-cookie");
  if (!setCookieHeader) {
    throw new Error("No set-cookie header found");
  }

  // Split by comma to get individual cookies, then find the one with a value (not the clear cookie)
  const cookies = setCookieHeader.split(", ");
  const actualCookie = cookies.find((c) => !c.includes("Max-Age=0"));
  
  if (!actualCookie) {
    throw new Error("No actual session cookie found (only clear cookies)");
  }

  const [cookieName, cookieValue] = actualCookie
    .split(";")[0]
    ?.split("=") as string[];

  if (typeof cookieName !== "string" || typeof cookieValue !== "string") {
    throw new Error("Invalid session cookie format");
  }

  return {
    redirectUri: enterCodeLocation,
    cookieName,
    cookieValue,
    state,
  };
}
