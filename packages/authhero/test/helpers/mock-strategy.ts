export const mockStrategy = {
  getRedirect: async () => {
    return "https://example.com/authorize";
  },
  validateAuthorizationCodeAndGetUser: async () => {
    return {
      sub: "123",
      email: "hello@example.com",
    };
  },
};
