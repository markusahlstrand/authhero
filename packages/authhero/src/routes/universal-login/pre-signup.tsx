import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import PreSignupPage from "../../components/PreSignUpPage";
import { EMAIL_VERIFICATION_EXPIRATION_TIME } from "../../constants";
import generateOTP from "../../utils/otp";
import { sendSignupValidateEmailAddress } from "../../emails";

export const preSignupRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/pre-signup
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "get",
      path: "/",
      request: {
        query: z.object({
          state: z.string().openapi({
            description: "The state parameter from the authorization request",
          }),
        }),
      },
      responses: {
        200: {
          description: "Response",
        },
      },
    }),
    async (ctx) => {
      const { state } = ctx.req.valid("query");
      const { theme, branding, client, loginSession } = await initJSXRoute(
        ctx,
        state,
      );

      const { username } = loginSession.authParams;

      if (!username) {
        throw new HTTPException(400, { message: "Username required" });
      }

      return ctx.html(
        <PreSignupPage
          state={state}
          theme={theme}
          branding={branding}
          client={client}
          email={username}
        />,
      );
    },
  )
  // --------------------------------
  // POST /u/pre-signup
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "post",
      path: "/",
      request: {
        query: z.object({
          state: z.string().openapi({
            description: "The state parameter from the authorization request",
          }),
        }),
      },
      responses: {
        200: {
          description: "Response",
        },
      },
    }),
    async (ctx) => {
      const { state } = ctx.req.valid("query");
      const { loginSession, client } = await initJSXRoute(ctx, state);

      const { username } = loginSession.authParams;

      if (!username) {
        throw new HTTPException(400, { message: "Username required" });
      }

      const otpCode = await ctx.env.data.codes.create(client.tenant.id, {
        code_id: generateOTP(),
        code_type: "email_verification",
        login_id: loginSession.id,
        expires_at: new Date(
          Date.now() + EMAIL_VERIFICATION_EXPIRATION_TIME,
        ).toISOString(),
      });

      await sendSignupValidateEmailAddress(
        ctx,
        username,
        otpCode.code_id,
        loginSession.id,
      );

      return ctx.redirect(`/u/pre-signup-sent?state=${state}`);
    },
  );
