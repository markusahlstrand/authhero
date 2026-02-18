/**
 * U2 Form Node Routes - Widget-based form node rendering
 *
 * These routes serve form nodes with SSR + hydration for the widget-based
 * universal login experience.
 *
 * Routes:
 * - GET /u2/forms/:formId/nodes/:nodeId - Render form node with widget SSR
 * - POST /u2/forms/:formId/nodes/:nodeId - Process form submission
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import { HTTPException } from "hono/http-exception";
import {
    createFrontChannelAuthResponse,
    completeLoginSessionHook,
    startLoginSessionContinuation,
} from "../../authentication-flows/common";
import {
    resolveNode,
    getRedirectUrl,
    FlowFetcher,
} from "../../hooks/formhooks";
import type {
    FormNodeComponent,
    UiScreen,
    Branding,
    Theme,
} from "@authhero/adapter-interfaces";
import {
    sanitizeUrl,
    sanitizeCssColor,
    buildThemePageBackground,
    escapeHtml,
} from "./sanitization-utils";

/**
 * Props for the WidgetPage component
 */
type WidgetPageProps = {
    widgetHtml: string;
    screenId: string;
    branding?: {
        colors?: {
            primary?: string;
            page_background?:
            | string
            | { type?: string; start?: string; end?: string; angle_deg?: number };
        };
        logo_url?: string;
        favicon_url?: string;
        font?: { url?: string };
    };
    theme?: Theme | null;
    themePageBackground?: {
        background_color?: string;
        background_image_url?: string;
        page_layout?: string;
    };
    clientName: string;
    poweredByLogo?: {
        url: string;
        alt: string;
        href?: string;
        height?: number;
    };
};

/**
 * Widget page component - renders the HTML page with SSR widget
 */
function WidgetPage({
    widgetHtml,
    screenId,
    branding,
    theme,
    themePageBackground,
    clientName,
    poweredByLogo,
}: WidgetPageProps) {
    // Build CSS variables from branding
    const cssVariables: string[] = [];
    const primaryColor = sanitizeCssColor(branding?.colors?.primary);
    if (primaryColor) {
        cssVariables.push(`--ah-color-primary: ${primaryColor}`);
    }

    const pageBackground = buildThemePageBackground(
        themePageBackground,
        branding?.colors?.page_background,
    );
    const faviconUrl = sanitizeUrl(branding?.favicon_url);
    const fontUrl = sanitizeUrl(branding?.font?.url);

    // Get widget background color for mobile view
    const widgetBackground =
        sanitizeCssColor(theme?.colors?.widget_background) || "#ffffff";

    // Sanitize powered-by logo URLs
    const safePoweredByUrl = poweredByLogo?.url
        ? sanitizeUrl(poweredByLogo.url)
        : null;
    const safePoweredByHref = poweredByLogo?.href
        ? sanitizeUrl(poweredByLogo.href)
        : null;

    // Determine justify-content based on page_layout
    const pageLayout = themePageBackground?.page_layout || "center";
    const justifyContent =
        pageLayout === "left"
            ? "flex-start"
            : pageLayout === "right"
                ? "flex-end"
                : "center";
    // Adjust padding based on page_layout
    const padding =
        pageLayout === "left"
            ? "20px 20px 20px 80px"
            : pageLayout === "right"
                ? "20px 80px 20px 20px"
                : "20px";

    const bodyStyle = {
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent,
        background: pageBackground,
        fontFamily: fontUrl
            ? "'Inter', system-ui, sans-serif"
            : "system-ui, -apple-system, sans-serif",
        padding,
    };

    const widgetContainerStyle =
        cssVariables.length > 0
            ? cssVariables.join("; ") + "; max-width: 400px; width: 100%;"
            : "max-width: 400px; width: 100%;";

    return (
        <html lang="en">
            <head>
                <meta charSet="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>Sign in - {clientName}</title>
                {faviconUrl && <link rel="icon" href={faviconUrl} />}
                {fontUrl && <link rel="stylesheet" href={fontUrl} />}
                <style
                    dangerouslySetInnerHTML={{
                        __html: `
              * { box-sizing: border-box; margin: 0; padding: 0; }
              .powered-by { position: fixed; bottom: 16px; left: 16px; opacity: 0.7; transition: opacity 0.2s; }
              .powered-by:hover { opacity: 1; }
              .powered-by img { display: block; }
              @media (max-width: 560px) {
                body { justify-content: center !important; padding: 20px !important; }
              }
              @media (max-width: 480px) {
                body { background: ${widgetBackground} !important; padding: 0 !important; }
                .widget-container { max-width: none; }
              }
            `,
                    }}
                />
                <script type="module" src="/u/widget/authhero-widget.esm.js" />
            </head>
            <body style={bodyStyle}>
                {/* SSR widget - rendered server-side, hydrated on client */}
                <div
                    data-screen={screenId}
                    style={widgetContainerStyle}
                    dangerouslySetInnerHTML={{ __html: widgetHtml }}
                />
                {safePoweredByUrl && (
                    <div class="powered-by">
                        {safePoweredByHref ? (
                            <a
                                href={safePoweredByHref}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <img
                                    src={safePoweredByUrl}
                                    alt={poweredByLogo?.alt || ""}
                                    height={poweredByLogo?.height || 20}
                                />
                            </a>
                        ) : (
                            <img
                                src={safePoweredByUrl}
                                alt={poweredByLogo?.alt || ""}
                                height={poweredByLogo?.height || 20}
                            />
                        )}
                    </div>
                )}
            </body>
        </html>
    );
}

/**
 * Convert form node components to UiScreen format for the widget
 */
function buildFormNodeScreen(
    formId: string,
    nodeId: string,
    formName: string,
    nodeAlias: string,
    components: FormNodeComponent[],
    state: string,
    error?: string,
): UiScreen {
    // Build screen from form node components
    // Transform components to work with the widget's floating label pattern
    const screenComponents: FormNodeComponent[] = [];
    let order = 0;

    // Add form components, transforming as needed for widget compatibility
    for (const comp of components) {
        // For field types with config.placeholder but no label, use placeholder as label
        // This ensures the floating label pattern works correctly
        // The widget uses `label` for the floating label, not `config.placeholder`
        if (
            (comp.type === "TEXT" ||
                comp.type === "EMAIL" ||
                comp.type === "PASSWORD" ||
                comp.type === "NUMBER" ||
                comp.type === "TEL" ||
                comp.type === "URL") &&
            !comp.label &&
            comp.config &&
            "placeholder" in comp.config &&
            comp.config.placeholder
        ) {
            screenComponents.push({
                ...comp,
                label: comp.config.placeholder,
                config: { ...comp.config, placeholder: undefined },
                order: order++,
            } as FormNodeComponent);
        } else {
            screenComponents.push({
                ...comp,
                order: order++,
            });
        }
    }

    const screen: UiScreen = {
        name: `form-${nodeAlias}`,
        action: `/u2/forms/${formId}/nodes/${nodeId}?state=${encodeURIComponent(state)}`,
        method: "POST",
        title: formName,
        components: screenComponents,
        messages: error
            ? [{ text: error, type: "error" as const }]
            : undefined,
    };

    return screen;
}

/**
 * Render the widget page with SSR
 */
async function renderWidgetPage(
    ctx: any,
    screenId: string,
    screen: UiScreen,
    state: string,
    branding: Branding | null,
    theme: Theme | null,
    clientName: string,
): Promise<Response> {
    const authParams = {
        client_id: "",
        state,
    };

    // Serialize data for widget attributes
    const screenJson = JSON.stringify(screen);
    const brandingJson = branding ? JSON.stringify(branding) : undefined;
    const authParamsJson = JSON.stringify(authParams);
    const themeJson = theme ? JSON.stringify(theme) : undefined;

    // Attempt SSR for the widget
    let widgetHtml = "";
    try {
        // Essential for some internal Stencil checks in edge runtimes
        if (typeof (globalThis as any).window === "undefined") {
            (globalThis as any).window = globalThis;
        }

        // Dynamic import to handle environments where hydrate module may not work
        const { renderToString } = await import("@authhero/widget/hydrate");
        const widgetHtmlResult = await renderToString(
            `<authhero-widget
        id="widget"
        data-screen="${escapeHtml(screenId)}"
        screen='${screenJson.replace(/'/g, "&#39;")}'
        ${brandingJson ? `branding='${brandingJson.replace(/'/g, "&#39;")}'` : ""}
        ${themeJson ? `theme='${themeJson.replace(/'/g, "&#39;")}'` : ""}
        state="${state}"
        auth-params='${authParamsJson.replace(/'/g, "&#39;")}'
        auto-submit="true"
        auto-navigate="true"
      ></authhero-widget>`,
            {
                fullDocument: false,
                serializeShadowRoot: "declarative-shadow-dom",
            },
        );
        widgetHtml = widgetHtmlResult.html || "";
    } catch (error) {
        console.error("SSR failed:", error);
    }

    // Return SSR widget page
    return ctx.html(
        <WidgetPage
            widgetHtml={widgetHtml}
            screenId={screenId}
            branding={
                branding
                    ? {
                        colors: branding.colors,
                        logo_url: branding.logo_url,
                        favicon_url: branding.favicon_url,
                        font: branding.font,
                    }
                    : undefined
            }
            theme={theme}
            themePageBackground={theme?.page_background}
            clientName={clientName}
            poweredByLogo={ctx.env.poweredByLogo}
        />,
    );
}

export const u2FormNodeRoutes = new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
}>()
    // --------------------------------
    // GET /u2/forms/:formId/nodes/:nodeId
    // --------------------------------
    .openapi(
        createRoute({
            tags: ["u2-forms"],
            method: "get",
            path: "/:formId/nodes/:nodeId",
            request: {
                params: z.object({
                    formId: z.string(),
                    nodeId: z.string(),
                }),
                query: z.object({
                    state: z.string(),
                }),
            },
            responses: {
                200: { description: "Form node HTML with widget" },
                404: { description: "Form or node not found" },
            },
        }),
        async (ctx) => {
            const { formId, nodeId } = ctx.req.valid("param");
            const { state } = ctx.req.valid("query");

            const { client, theme, branding } = await initJSXRoute(ctx, state, true);

            const form = await ctx.env.data.forms.get(client.tenant.id, formId);

            if (!form) {
                throw new HTTPException(404, { message: "Form not found" });
            }

            // Only STEP nodes have components
            const node = (form.nodes || []).find(
                (n: any) => n.id === nodeId && n.type === "STEP",
            );

            if (!node) {
                throw new HTTPException(404, {
                    message: "Node not found or not a STEP node",
                });
            }

            const components: FormNodeComponent[] =
                "components" in node.config ? node.config.components : [];

            // Build the UiScreen from form node components
            const screen = buildFormNodeScreen(
                formId,
                nodeId,
                form.name,
                node.alias || node.type,
                components,
                state,
            );

            return renderWidgetPage(
                ctx,
                `form-${node.alias || nodeId}`,
                screen,
                state,
                branding,
                theme,
                client.name || "AuthHero",
            );
        },
    )
    // --------------------------------
    // POST /u2/forms/:formId/nodes/:nodeId
    // --------------------------------
    .openapi(
        createRoute({
            tags: ["u2-forms"],
            method: "post",
            path: "/:formId/nodes/:nodeId",
            request: {
                params: z.object({
                    formId: z.string(),
                    nodeId: z.string(),
                }),
                query: z.object({
                    state: z.string(),
                }),
                body: {
                    content: {
                        "application/json": {
                            schema: z.object({
                                data: z.record(z.string(), z.any()),
                            }),
                        },
                    },
                },
            },
            responses: {
                200: {
                    description: "Next screen or redirect",
                    content: {
                        "application/json": {
                            schema: z.union([
                                z.object({
                                    screen: z.any(),
                                    branding: z.any(),
                                }),
                                z.object({ redirect: z.string() }),
                            ]),
                        },
                    },
                },
                404: { description: "Form or node not found" },
            },
        }),
        async (ctx) => {
            const { formId, nodeId } = ctx.req.valid("param");
            const { state } = ctx.req.valid("query");
            const { branding, client } = await initJSXRoute(ctx, state, true);

            let form: any = undefined;
            let node: any = undefined;
            let components: FormNodeComponent[] = [];

            try {
                form = await ctx.env.data.forms.get(client.tenant.id, formId);
                if (!form) {
                    throw new HTTPException(404, { message: "Form not found" });
                }

                node = (form.nodes || []).find(
                    (n: any) => n.id === nodeId && n.type === "STEP",
                );
                if (!node) {
                    throw new HTTPException(404, {
                        message: "Node not found or not a STEP node",
                    });
                }

                components = "components" in node.config ? node.config.components : [];

                const { data } = ctx.req.valid("json");
                const missingFields: string[] = [];
                const submittedFields: Record<string, string> = {};

                for (const comp of components) {
                    if (comp.type === "LEGAL") {
                        const name = comp.id;
                        const isRequired = !!comp.required;
                        const value = data[name];
                        if (isRequired && (!value || value === "")) {
                            missingFields.push(name);
                        } else if (typeof value === "string") {
                            submittedFields[name] = value;
                        }
                    }
                }

                if (missingFields.length > 0) {
                    // Return JSON with screen for re-render
                    const screen = buildFormNodeScreen(
                        formId,
                        nodeId,
                        form.name,
                        node.alias || node.type,
                        components,
                        state,
                        `Missing required fields: ${missingFields.join(", ")}`,
                    );

                    return ctx.json({
                        screen,
                        branding,
                    });
                }

                // All required fields present, continue with session and user lookup
                const loginSession = await ctx.env.data.loginSessions.get(
                    client.tenant.id,
                    state,
                );
                if (
                    !loginSession ||
                    !loginSession.session_id ||
                    !loginSession.authParams
                ) {
                    throw new Error("Session expired");
                }

                const session = await ctx.env.data.sessions.get(
                    client.tenant.id,
                    loginSession.session_id,
                );
                if (!session || !session.user_id) {
                    throw new Error("Session expired");
                }

                const user = await ctx.env.data.users.get(
                    ctx.var.tenant_id,
                    session.user_id,
                );
                if (!user) {
                    throw new Error("Session expired");
                }

                // Check if there's a next_node in the STEP config
                const nextNodeId = node.config?.next_node;
                if (nextNodeId && form.nodes) {
                    // Create a flow fetcher for async flow resolution
                    const flowFetcher: FlowFetcher = async (flowId: string) => {
                        const flow = await ctx.env.data.flows.get(client.tenant.id, flowId);
                        if (!flow) return null;
                        return {
                            actions: flow.actions?.map((action) => ({
                                type: action.type,
                                action: action.action,
                                params:
                                    "params" in action &&
                                        action.params &&
                                        typeof action.params === "object" &&
                                        "target" in action.params
                                        ? {
                                            target: action.params.target as
                                                | "change-email"
                                                | "account"
                                                | "custom",
                                            custom_url:
                                                "custom_url" in action.params
                                                    ? action.params.custom_url
                                                    : undefined,
                                        }
                                        : undefined,
                            })),
                        };
                    };

                    // Resolve the next node (could be FLOW, ROUTER, ACTION, or another STEP)
                    const resolveResult = await resolveNode(
                        form.nodes,
                        nextNodeId,
                        { user },
                        flowFetcher,
                    );

                    if (resolveResult) {
                        if (resolveResult.type === "redirect") {
                            // FLOW or ACTION node with REDIRECT - redirect to the target
                            const target = resolveResult.target as
                                | "change-email"
                                | "account"
                                | "custom";
                            const redirectUrl = getRedirectUrl(
                                target,
                                resolveResult.customUrl,
                                state,
                            );

                            // For account pages (change-email, account), use continuation state
                            if (target === "change-email" || target === "account") {
                                // Return URL is /u2/continue which will resume the login flow
                                const returnUrl = `/u2/continue?state=${encodeURIComponent(state)}`;
                                await startLoginSessionContinuation(
                                    ctx,
                                    client.tenant.id,
                                    loginSession,
                                    [target],
                                    returnUrl,
                                );
                            }

                            return ctx.json({ redirect: redirectUrl });
                        }

                        if (resolveResult.type === "step") {
                            // Another STEP node - fetch the screen and return it
                            const nextNode = (form.nodes || []).find(
                                (n: any) => n.id === resolveResult.nodeId && n.type === "STEP",
                            );
                            if (nextNode) {
                                const nextComponents: FormNodeComponent[] =
                                    "components" in nextNode.config
                                        ? nextNode.config.components
                                        : [];
                                const nextScreen = buildFormNodeScreen(
                                    formId,
                                    resolveResult.nodeId,
                                    form.name,
                                    nextNode.alias || nextNode.type,
                                    nextComponents,
                                    state,
                                );
                                return ctx.json({
                                    screen: nextScreen,
                                    branding,
                                    navigateUrl: `/u2/forms/${formId}/nodes/${resolveResult.nodeId}?state=${encodeURIComponent(state)}`,
                                });
                            }
                            // Fallback: redirect to the next node
                            return ctx.json({
                                redirect: `/u2/forms/${formId}/nodes/${resolveResult.nodeId}?state=${encodeURIComponent(state)}`,
                            });
                        }

                        // type === "end" - fall through to complete the auth flow
                    }
                }

                // No next_node or reached end - complete the auth flow
                // Transition from AWAITING_HOOK back to AUTHENTICATED
                await completeLoginSessionHook(ctx, client.tenant.id, loginSession);

                const result = await createFrontChannelAuthResponse(ctx, {
                    authParams: loginSession.authParams,
                    client,
                    user,
                    loginSession,
                    skipHooks: true,
                });

                // Extract the redirect location and cookies from the Response
                const location = result.headers.get("location");
                if (location) {
                    const cookies = result.headers.getSetCookie?.() || [];
                    const response = ctx.json({ redirect: location });
                    cookies.forEach((cookie) => {
                        response.headers.append("set-cookie", cookie);
                    });
                    return response;
                }

                // Fallback: return the response as-is (for web_message mode etc)
                return result;
            } catch (err) {
                // Return JSON with screen for error re-render
                const screen = buildFormNodeScreen(
                    formId,
                    nodeId,
                    form?.name || "",
                    node?.alias || nodeId || "",
                    components,
                    state,
                    "Your session has expired. Please try again.",
                );

                return ctx.json({
                    screen,
                    branding,
                });
            }
        },
    );
