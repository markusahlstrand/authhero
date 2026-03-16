import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";

describe("error page", () => {
  it("should render a branded error page for state_not_found", async () => {
    const { universalApp, env } = await getTestServer();
    const universalClient = testClient(universalApp, env);

    const response = await universalClient.error.$get({
      query: {
        error: "state_not_found",
      },
    });

    expect(response.status).toEqual(400);
    const html = await response.text();
    expect(html).toContain("Something went wrong");
    expect(html).toContain(
      "Your login session has expired or is invalid. Please go back to the application and try signing in again.",
    );
  });

  it("should render a branded error page for session_not_found", async () => {
    const { universalApp, env } = await getTestServer();
    const universalClient = testClient(universalApp, env);

    const response = await universalClient.error.$get({
      query: {
        error: "session_not_found",
      },
    });

    expect(response.status).toEqual(400);
    const html = await response.text();
    expect(html).toContain(
      "Your login session has expired. Please return to the application and try again.",
    );
  });

  it("should use error_description when provided", async () => {
    const { universalApp, env } = await getTestServer();
    const universalClient = testClient(universalApp, env);

    const response = await universalClient.error.$get({
      query: {
        error: "custom_error",
        error_description: "A custom error message",
      },
    });

    expect(response.status).toEqual(400);
    const html = await response.text();
    expect(html).toContain("A custom error message");
  });

  it("should render a default message when no error params provided", async () => {
    const { universalApp, env } = await getTestServer();
    const universalClient = testClient(universalApp, env);

    const response = await universalClient.error.$get({
      query: {},
    });

    expect(response.status).toEqual(400);
    const html = await response.text();
    expect(html).toContain(
      "An unexpected error occurred. Please try again later.",
    );
  });
});
