const config = {
  compilationOptions: {
    preferredConfigPath: "./tsconfig.json",
  },
  entries: [
    {
      filePath: "./src/index.ts",
      outFile: "./dist/saml.d.ts",
      noCheck: true,
    },
  ],
};

module.exports = config;
