module.exports = {
  entries: [
    {
      filePath: "./src/index.ts",
      outFile: "./dist/saml.d.ts",
      noCheck: false,
      output: {
        noBanner: true,
      },
    },
    {
      filePath: "./src/core.ts",
      outFile: "./dist/core.d.ts",
      noCheck: false,
      output: {
        noBanner: true,
      },
    },
    {
      filePath: "./src/local-signer.ts",
      outFile: "./dist/local-signer.d.ts",
      noCheck: false,
      output: {
        noBanner: true,
      },
    },
  ],
};
