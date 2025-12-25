const config = {
  compilationOptions: {
    preferredConfigPath: "./tsconfig.json",
  },
  entries: [
    {
      filePath: "./src/index.ts",
      outFile: "./dist/multi-tenancy.d.ts",
      noCheck: true,
      libraries: {
        inlinedLibraries: ["@authhero/adapter-interfaces"],
        allowedTypesLibraries: ["authhero", "libphonenumber-js"],
      },
    },
  ],
};

module.exports = config;
