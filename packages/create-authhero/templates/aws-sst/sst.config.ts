/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "authhero",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    // ════════════════════════════════════════════════════════════════════════
    // DynamoDB Table - Single-table design for all AuthHero data
    // ════════════════════════════════════════════════════════════════════════
    const table = new sst.aws.Dynamo("AuthHeroTable", {
      fields: {
        pk: "string",
        sk: "string",
        gsi1pk: "string",
        gsi1sk: "string",
        gsi2pk: "string",
        gsi2sk: "string",
      },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
      globalIndexes: {
        gsi1: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
        gsi2: { hashKey: "gsi2pk", rangeKey: "gsi2sk" },
      },
      ttl: "expiresAt",
    });

    // ════════════════════════════════════════════════════════════════════════
    // S3 Bucket + CloudFront for Widget Assets
    // ════════════════════════════════════════════════════════════════════════
    const assets = new sst.aws.StaticSite("WidgetAssets", {
      path: "dist/assets",
      build: {
        command: "node copy-assets.js",
        output: "dist/assets",
      },
    });

    // ════════════════════════════════════════════════════════════════════════
    // Lambda Function
    // ════════════════════════════════════════════════════════════════════════
    const api = new sst.aws.ApiGatewayV2("AuthHeroApi");

    const authFunction = new sst.aws.Function("AuthHeroFunction", {
      handler: "src/index.handler",
      runtime: "nodejs20.x",
      timeout: "30 seconds",
      memory: "512 MB",
      link: [table],
      environment: {
        TABLE_NAME: table.name,
        WIDGET_URL: assets.url,
      },
      nodejs: {
        install: ["@authhero/aws"],
      },
    });

    api.route("$default", authFunction.arn);

    // ════════════════════════════════════════════════════════════════════════
    // Optional: Custom Domain
    // ════════════════════════════════════════════════════════════════════════
    // Uncomment and configure to use a custom domain:
    //
    // api.domain = {
    //   name: "auth.yourdomain.com",
    //   dns: sst.aws.dns(),
    // };

    return {
      api: api.url,
      assets: assets.url,
      table: table.name,
    };
  },
});
