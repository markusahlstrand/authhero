import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { getClientWithDefaults } from "../../helpers/client";
import i18next from "i18next";
import {
  Client,
  LogTypes,
  VendorSettings,
  vendorSettingsSchema,
} from "@authhero/adapter-interfaces";
import { getPrimaryUserByEmail } from "../../helpers/users";
import { Bindings, Variables } from "../../types";

// there is no Sesamy vendor settings... we have this on login2 as a fallback and I think there's
// some interaction with "dark mode"
// But I don't want to have a Sesamy vendor on auth2
export const SESAMY_VENDOR_SETTINGS: VendorSettings = {
  name: "sesamy",
  logoUrl: `https://assets.sesamy.com/static/images/email/sesamy-logo.png`,
  style: {
    primaryColor: "#7D68F4",
    buttonTextColor: "#FFFFFF",
    primaryHoverColor: "#A091F2",
  },
  loginBackgroundImage: "",
  checkoutHideSocial: false,
  supportEmail: "support@sesamy.com",
  supportUrl: "https://support.sesamy.com",
  siteUrl: "https://sesamy.com",
  termsAndConditionsUrl: "https://store.sesamy.com/pages/terms-of-service",
  manageSubscriptionsUrl: "https://account.sesamy.com/manage-subscriptions",
};

export async function fetchVendorSettings(
  env: Bindings,
  client_id?: string,
  vendor_id?: string,
) {
  if (!vendor_id && !client_id) {
    return SESAMY_VENDOR_SETTINGS;
  }

  const vendorId = vendor_id || client_id;

  try {
    const vendorSettingsRes = await fetch(
      `${env.API_URL}/profile/vendors/${vendorId}/style`,
    );

    if (!vendorSettingsRes.ok) {
      throw new Error("Failed to fetch vendor settings");
    }

    const vendorSettingsRaw = await vendorSettingsRes.json();

    const vendorSettings = vendorSettingsSchema.parse(vendorSettingsRaw);

    return vendorSettings;
  } catch (e) {
    console.error(e);
    return SESAMY_VENDOR_SETTINGS;
  }
}

export async function initJSXRoute(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  state: string,
) {
  const { env } = ctx;
  const loginSession = await env.data.loginSessions.get(
    ctx.var.tenant_id || "",
    state,
  );
  if (!loginSession) {
    throw new HTTPException(400, { message: "Login session not found" });
  }
  ctx.set("loginSession", loginSession);

  const client = await getClientWithDefaults(
    env,
    loginSession.authParams.client_id,
  );
  ctx.set("client_id", client.id);
  ctx.set("tenant_id", client.tenant.id);

  const tenant = await env.data.tenants.get(client.tenant.id);
  if (!tenant) {
    throw new HTTPException(400, { message: "Tenant not found" });
  }

  const vendorSettings = await fetchVendorSettings(
    env,
    client.id,
    loginSession.authParams.vendor_id,
  );

  const loginSessionLanguage = loginSession.authParams.ui_locales
    ?.split(" ")
    .map((locale) => locale.split("-")[0])
    .find((language) => {
      if (Array.isArray(i18next.options.supportedLngs)) {
        return i18next.options.supportedLngs.includes(language);
      }
    });

  await i18next.changeLanguage(loginSessionLanguage || tenant.language || "sv");

  return {
    vendorSettings: {
      ...vendorSettings,
      // HACK: Change the terms and conditions for fokus app
      termsAndConditionsUrl:
        client.id === "fokus-app"
          ? "https://www.fokus.se/kopvillkor-app/"
          : vendorSettings.termsAndConditionsUrl,
    },
    client,
    tenant,
    loginSession,
  };
}

export async function usePasswordLogin(
  ctx: Context,
  client: Client,
  username: string,
  login_selection?: "password" | "code",
) {
  if (login_selection !== undefined) {
    return login_selection === "password";
  }

  // Get primary user for email
  const user = await getPrimaryUserByEmail({
    userAdapter: ctx.env.data.users,
    tenant_id: client.tenant.id,
    email: username,
  });

  if (user) {
    // Get last login
    const lastLogins = await ctx.env.data.logs.list(client.tenant.id, {
      page: 0,
      per_page: 10,
      include_totals: false,
      sort: { sort_by: "date", sort_order: "desc" },
      q: `type:${LogTypes.SUCCESS_LOGIN} user_id:${user.user_id}`,
    });

    const [lastLogin] = lastLogins.logs.filter(
      (log) =>
        log.strategy &&
        ["Username-Password-Authentication", "passwordless", "email"].includes(
          log.strategy,
        ),
    );

    if (lastLogin) {
      return lastLogin.strategy === "Username-Password-Authentication";
    }
  }

  const promptSettings = await ctx.env.data.promptSettings.get(
    client.tenant.id,
  );
  return promptSettings.password_first;
}
