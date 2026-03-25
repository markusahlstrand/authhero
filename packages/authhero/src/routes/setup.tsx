import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../types";
import { seed } from "../seed";
import { buildHash } from "../build-hash";

const setupApp = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
}

function SetupPage({ error }: { error?: string }) {
  return (
    <html lang="en">
      <head>
        <title>Setup - AuthHero</title>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="stylesheet" href={`/u/css/tailwind.css?v=${buildHash}`} />
      </head>
      <body class="bg-gray-50 dark:bg-gray-900">
        <div class="flex min-h-screen items-center justify-center p-4">
          <div class="w-full max-w-md rounded-2xl bg-white p-10 shadow-lg dark:bg-gray-800">
            <div class="mb-8 text-center">
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                Welcome to AuthHero
              </h1>
              <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Let's set up your authentication server.
              </p>
            </div>

            {error && (
              <div class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            <form method="post" action="/setup">
              <div class="space-y-4">
                <div>
                  <label
                    for="email"
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Admin email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    placeholder="admin@example.com"
                  />
                </div>

                <div>
                  <label
                    for="password"
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Admin password
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    required
                    minLength={8}
                    class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    for="confirm_password"
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Confirm password
                  </label>
                  <input
                    type="password"
                    id="confirm_password"
                    name="confirm_password"
                    required
                    minLength={8}
                    class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <fieldset class="mt-4">
                  <legend class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Deployment mode
                  </legend>
                  <div class="mt-2 space-y-2">
                    <label class="flex items-start gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">
                      <input
                        type="radio"
                        name="mode"
                        value="single"
                        checked
                        class="mt-0.5"
                        onclick="document.getElementById('name_label').textContent='Tenant name'; document.getElementById('name').placeholder='My App';"
                      />
                      <div>
                        <div class="text-sm font-medium text-gray-900 dark:text-white">
                          Single-tenant
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                          One tenant for one application or company.
                        </div>
                      </div>
                    </label>
                    <label class="flex items-start gap-3 rounded-lg border border-gray-200 p-3 cursor-pointer hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">
                      <input
                        type="radio"
                        name="mode"
                        value="multi"
                        class="mt-0.5"
                        onclick="document.getElementById('name_label').textContent='Control plane name'; document.getElementById('name').placeholder='Control Plane';"
                      />
                      <div>
                        <div class="text-sm font-medium text-gray-900 dark:text-white">
                          Multi-tenant
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                          Manage multiple tenants from a central control plane.
                        </div>
                      </div>
                    </label>
                  </div>
                </fieldset>

                <div>
                  <label
                    for="name"
                    id="name_label"
                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Tenant name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    class="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    placeholder="My App"
                  />
                </div>
              </div>

              <button
                type="submit"
                class="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                Set up AuthHero
              </button>
            </form>
          </div>
        </div>
      </body>
    </html>
  );
}

function SuccessPage({
  tenantId,
  clientId,
  clientSecret,
  isMultiTenant,
}: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  isMultiTenant: boolean;
}) {
  return (
    <html lang="en">
      <head>
        <title>Setup Complete - AuthHero</title>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="stylesheet" href={`/u/css/tailwind.css?v=${buildHash}`} />
      </head>
      <body class="bg-gray-50 dark:bg-gray-900">
        <div class="flex min-h-screen items-center justify-center p-4">
          <div class="w-full max-w-md rounded-2xl bg-white p-10 shadow-lg dark:bg-gray-800">
            <div class="mb-8 text-center">
              <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <svg
                  class="h-6 w-6 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
                Setup Complete
              </h1>
              <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Your {isMultiTenant ? "control plane" : "tenant"} is ready.
              </p>
            </div>

            <div class="space-y-3">
              <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                <div class="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Mode
                </div>
                <div class="text-sm text-gray-900 dark:text-white">
                  {isMultiTenant ? "Multi-tenant" : "Single-tenant"}
                </div>
              </div>

              <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                <div class="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Tenant ID
                </div>
                <div class="text-sm font-mono text-gray-900 dark:text-white">
                  {tenantId}
                </div>
              </div>

              <div class="rounded-lg bg-gray-50 p-3 dark:bg-gray-700">
                <div class="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Client ID
                </div>
                <div class="text-sm font-mono text-gray-900 dark:text-white">
                  {clientId}
                </div>
              </div>

              <div class="rounded-lg bg-yellow-50 border border-yellow-200 p-3 dark:bg-yellow-900/20 dark:border-yellow-800">
                <div class="text-xs font-medium text-yellow-700 dark:text-yellow-400">
                  Client Secret (save this — it won't be shown again)
                </div>
                <div class="mt-1 flex items-center gap-2">
                  <code
                    id="secret"
                    class="flex-1 text-sm font-mono text-yellow-800 dark:text-yellow-300 break-all"
                  >
                    {clientSecret}
                  </code>
                  <button
                    type="button"
                    onclick="navigator.clipboard.writeText(document.getElementById('secret').textContent);this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',2000)"
                    class="shrink-0 rounded bg-yellow-200 px-2 py-1 text-xs font-medium text-yellow-800 hover:bg-yellow-300 dark:bg-yellow-800 dark:text-yellow-200 dark:hover:bg-yellow-700"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>

            {isMultiTenant && (
              <p class="mt-4 text-xs text-gray-500 dark:text-gray-400">
                You can create additional tenants from the admin dashboard.
              </p>
            )}

            <div class="mt-6 space-y-2">
              <a
                href="/"
                class="block w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
              >
                Continue
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

// GET /setup - render the setup form
setupApp.openapi(
  createRoute({
    tags: ["setup"],
    method: "get",
    path: "/",
    responses: {
      200: { description: "Setup form" },
      404: { description: "Setup not available (already configured)" },
    },
  }),
  async (ctx) => {
    const { tenants } = await ctx.env.data.tenants.list();
    if (tenants.length > 0) {
      return ctx.notFound();
    }

    return ctx.html(<SetupPage />);
  },
);

// POST /setup - process the setup form
setupApp.openapi(
  createRoute({
    tags: ["setup"],
    method: "post",
    path: "/",
    request: {
      body: {
        content: {
          "application/x-www-form-urlencoded": {
            schema: z.object({
              email: z.string().email(),
              password: z.string().min(8),
              confirm_password: z.string().min(8),
              mode: z.enum(["single", "multi"]),
              name: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "Setup complete" },
      400: { description: "Validation error" },
      404: { description: "Setup not available (already configured)" },
    },
  }),
  async (ctx) => {
    // Check if already set up
    const { tenants } = await ctx.env.data.tenants.list();
    if (tenants.length > 0) {
      return ctx.notFound();
    }

    const { email, password, confirm_password, mode, name } =
      ctx.req.valid("form");

    // Validate passwords match
    if (password !== confirm_password) {
      return ctx.html(<SetupPage error="Passwords do not match." />, 400);
    }

    const isMultiTenant = mode === "multi";
    const tenantName = name || (isMultiTenant ? "Control Plane" : "My App");
    const tenantId = isMultiTenant ? "control_plane" : slugify(tenantName);

    // Build callback URLs from the current request origin
    const origin = new URL(ctx.req.url).origin;
    const callbacks = [
      `${origin}/auth-callback`,
      "https://manage.authhero.net/auth-callback",
      "https://local.authhero.net/auth-callback",
      "https://localhost:5173/auth-callback",
      "https://localhost:3000/auth-callback",
    ];
    const allowedLogoutUrls = [
      origin,
      "https://manage.authhero.net",
      "https://local.authhero.net",
      "https://localhost:5173",
      "https://localhost:3000",
    ];

    const result = await seed(ctx.env.data, {
      adminUsername: email,
      adminPassword: password,
      tenantId,
      tenantName,
      isControlPlane: isMultiTenant,
      callbacks,
      allowedLogoutUrls,
      debug: false,
    });

    return ctx.html(
      <SuccessPage
        tenantId={result.tenantId}
        clientId={result.clientId}
        clientSecret={result.clientSecret}
        isMultiTenant={isMultiTenant}
      />,
    );
  },
);

export default setupApp;
