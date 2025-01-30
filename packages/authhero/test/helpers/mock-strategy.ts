import { Strategy } from "../../src/strategies";

export const mockStrategy: Strategy = {
  getRedirect: async () => {
    return {
      redirectUrl: "https://example.com/authorize",
      code: "code",
    };
  },
  validateAuthorizationCodeAndGetUser: async () => {
    return {
      sub: "123",
      email: "hello@example.com",
    };
  },
};
