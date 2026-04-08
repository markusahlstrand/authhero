import { Context } from "hono";
import { AuthHeroConfig, init } from "authhero";
import { swaggerUI } from "@hono/swagger-ui";
import { serveStatic } from "@hono/node-server/serve-static";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve absolute paths to avoid issues with different working directories
const widgetPath = path.resolve(
  __dirname,
  "../node_modules/@authhero/widget/dist/authhero-widget",
);

const adminDistPath = path.resolve(
  __dirname,
  "../node_modules/@authhero/react-admin/dist",
);
const adminIndexPath = path.join(adminDistPath, "index.html");

export default function createApp(config: AuthHeroConfig) {
  // Configure widget and admin handlers before init()
  const configWithHandlers: AuthHeroConfig = {
    ...config,
    widgetHandler: serveStatic({
      root: widgetPath,
      rewriteRequestPath: (p) => p.replace("/u/widget", ""),
    }),
  };

  // Add admin UI handler if the package is installed
  if (fs.existsSync(adminIndexPath)) {
    const issuer =
      process.env.ISSUER || `https://localhost:${process.env.PORT || 3000}/`;
    const rawHtml = fs
      .readFileSync(adminIndexPath, "utf-8")
      .replace(/src="\.\/assets\//g, 'src="/admin/assets/')
      .replace(/href="\.\/assets\//g, 'href="/admin/assets/');
    const configJson = JSON.stringify({
      domain: issuer.replace(/\/$/, ""),
      clientId: "default",
      basePath: "/admin",
    }).replace(/</g, "\\u003c");
    configWithHandlers.adminIndexHtml = rawHtml.replace(
      "</head>",
      `<script>window.__AUTHHERO_ADMIN_CONFIG__=${configJson};</script>\n</head>`,
    );
    configWithHandlers.adminHandler = serveStatic({
      root: adminDistPath,
      rewriteRequestPath: (p: string) => p.replace("/admin", ""),
    });
  }

  const { app } = init(configWithHandlers);

  app
    .get("/", async (ctx: Context) => {
      return ctx.json({
        name: "AuthHero Server",
        status: "running",
      });
    })
    .get("/docs", swaggerUI({ url: "/api/v2/spec" }));

  return app;
}
