import { Strategy } from "../../src/strategies";

export const mockStrategy: Strategy = {
  getRedirect: async () => {
    return {
      redirectUrl: "https://example.com/authorize",
      code: "code",
    };
  },
  validateAuthorizationCodeAndGetUser: async (
    _ctx,
    _connection,
    code: string,
  ) => {
    // This is a way to provide different mock responses
    switch (code) {
      case "foo@example.com":
        return {
          sub: "foo",
          email: "foo@example.com",
        };
    }

    return {
      sub: "123",
      email: "hello@example.com",
    };
  },
};
