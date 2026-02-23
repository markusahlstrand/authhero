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
    buildUserUpdates,
    mergeUserUpdates,
    resolveTemplateField,
} from "../../hooks/formhooks";
import type {
    FormNodeComponent,
    UiScreen,
    Branding,
    Theme,
    User,
} from "@authhero/adapter-interfaces";
import {
    renderWidgetPageResponse,
} from "./u2-widget-page";



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
    user?: User,
): UiScreen {
    // Build screen from form node components
    // Transform components to work with the widget's floating label pattern
    const screenComponents: FormNodeComponent[] = [];
    let order = 0;

    // Add form components, transforming as needed for widget compatibility
    for (const comp of components) {
        // Resolve default_value templates from user context
        let resolvedComp = comp;
        if (
            user &&
            comp.config &&
            "default_value" in comp.config &&
            typeof comp.config.default_value === "string" &&
            comp.config.default_value.startsWith("{{") &&
            comp.config.default_value.endsWith("}}")
        ) {
            const resolved = resolveTemplateField(comp.config.default_value, { user });
            resolvedComp = {
                ...comp,
                config: {
                    ...comp.config,
                    default_value: resolved ?? "",
                },
            } as FormNodeComponent;
        }

        // For field types with config.placeholder but no label, use placeholder as label
        // This ensures the floating label pattern works correctly
        // The widget uses `label` for the floating label, not `config.placeholder`
        if (
            (resolvedComp.type === "TEXT" ||
                resolvedComp.type === "EMAIL" ||
                resolvedComp.type === "PASSWORD" ||
                resolvedComp.type === "NUMBER" ||
                resolvedComp.type === "TEL" ||
                resolvedComp.type === "URL") &&
            !resolvedComp.label &&
            resolvedComp.config &&
            "placeholder" in resolvedComp.config &&
            resolvedComp.config.placeholder
        ) {
            screenComponents.push({
                ...resolvedComp,
                label: resolvedComp.config.placeholder,
                config: { ...resolvedComp.config, placeholder: undefined },
                order: order++,
            } as FormNodeComponent);
        } else {
            screenComponents.push({
                ...resolvedComp,
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
 * Render the widget page with SSR for a form node screen.
 */
async function renderFormNodeWidgetPage(
    ctx: any,
    screenId: string,
    screen: UiScreen,
    state: string,
    branding: Branding | null,
    theme: Theme | null,
    clientName: string,
    clientId: string,
    termsAndConditionsUrl?: string,
): Promise<Response> {
    const screenJson = JSON.stringify(screen);
    const brandingJson = branding ? JSON.stringify(branding) : undefined;
    const themeJson = theme ? JSON.stringify(theme) : undefined;
    const authParamsJson = JSON.stringify({ client_id: clientId, state });

    return renderWidgetPageResponse(ctx, {
        screenId,
        screenJson,
        brandingJson,
        themeJson,
        state,
        authParamsJson,
        branding,
        theme,
        clientName,
        poweredByLogo: ctx.env.poweredByLogo,
        termsAndConditionsUrl,
    });
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

            const { client, theme, branding, loginSession } = await initJSXRoute(ctx, state, true);

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

            // Try to fetch the user for resolving default_value templates
            let user: User | undefined;
            if (loginSession.session_id) {
                const session = await ctx.env.data.sessions.get(
                    client.tenant.id,
                    loginSession.session_id,
                );
                if (session?.user_id) {
                    user = await ctx.env.data.users.get(
                        client.tenant.id,
                        session.user_id,
                    ) ?? undefined;
                }
            } else if (loginSession.user_id) {
                user = await ctx.env.data.users.get(
                    client.tenant.id,
                    loginSession.user_id,
                ) ?? undefined;
            }

            // Build the UiScreen from form node components
            const screen = buildFormNodeScreen(
                formId,
                nodeId,
                form.name,
                node.alias || node.type,
                components,
                state,
                undefined,
                user,
            );

            return renderFormNodeWidgetPage(
                ctx,
                `form-${node.alias || nodeId}`,
                screen,
                state,
                branding,
                theme,
                client.name || "AuthHero",
                client.client_id,
                client.client_metadata?.termsAndConditionsUrl,
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

                // Field component types that collect user input
                const fieldTypes = new Set([
                    "LEGAL", "TEXT", "DATE", "DROPDOWN", "EMAIL", "NUMBER",
                    "BOOLEAN", "CHOICE", "TEL", "URL", "PASSWORD", "CARDS",
                ]);
                for (const comp of components) {
                    if (fieldTypes.has(comp.type)) {
                        const name = comp.id;
                        const compAny = comp as Record<string, unknown>;
                        const isRequired = !!compAny.required;
                        const value = data[name];
                        if (isRequired && (!value || value === "")) {
                            missingFields.push((compAny.label as string) || name);
                        }
                        if (typeof value === "string" && value !== "") {
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
                    client.tenant.id,
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
                                params: "params" in action && action.params ? action.params as Record<string, unknown> : undefined,
                            })),
                        };
                    };

                    // Resolve the next node (could be FLOW, ROUTER, ACTION, or another STEP)
                    const resolveResult = await resolveNode(
                        form.nodes,
                        nextNodeId,
                        { user, submittedFields },
                        flowFetcher,
                    );

                    if (resolveResult) {
                        // Execute any pending user updates from AUTH0 UPDATE_USER actions
                        if (resolveResult.userUpdates && resolveResult.userUpdates.length > 0) {
                            const merged = mergeUserUpdates(resolveResult.userUpdates);
                            for (const update of merged) {
                                const userUpdates = buildUserUpdates(update.changes, user);
                                await ctx.env.data.users.update(
                                    client.tenant.id,
                                    update.user_id,
                                    userUpdates,
                                );
                            }
                        }

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
                // Let HTTPExceptions (e.g. 404 form/node not found) propagate
                if (err instanceof HTTPException) {
                    throw err;
                }

                console.error("Form node POST error:", err);

                const isSessionError = err instanceof Error && err.message === "Session expired";
                const errorMessage = isSessionError
                    ? "Your session has expired. Please try again."
                    : "An error occurred. Please try again.";

                // Return JSON with screen for error re-render
                const screen = buildFormNodeScreen(
                    formId,
                    nodeId,
                    form?.name || "",
                    node?.alias || nodeId || "",
                    components,
                    state,
                    errorMessage,
                );

                return ctx.json({
                    screen,
                    branding,
                });
            }
        },
    );
