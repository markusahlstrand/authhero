/**
 * Account Profile screen - edit personal information
 *
 * Corresponds to: /u2/account/profile
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { resolveAccountUser } from "./account-helpers";

/**
 * Create the account-profile screen
 */
export async function accountProfileScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, errors, messages, routePrefix = "/u2" } = context;

  const { user } = await resolveAccountUser(context);

  const stateParam = encodeURIComponent(state);

  const components: FormNodeComponent[] = [
    {
      id: "given_name",
      type: "TEXT",
      category: "FIELD",
      visible: true,
      label: "First Name",
      config: {
        placeholder: "First Name",
        default_value: user.given_name || "",
      },
      required: false,
      order: 0,
      messages: errors?.given_name
        ? [{ text: errors.given_name, type: "error" as const }]
        : undefined,
    },
    {
      id: "family_name",
      type: "TEXT",
      category: "FIELD",
      visible: true,
      label: "Last Name",
      config: {
        placeholder: "Last Name",
        default_value: user.family_name || "",
      },
      required: false,
      order: 1,
      messages: errors?.family_name
        ? [{ text: errors.family_name, type: "error" as const }]
        : undefined,
    },
    {
      id: "nickname",
      type: "TEXT",
      category: "FIELD",
      visible: true,
      label: "Nickname",
      config: {
        placeholder: "Nickname",
        default_value: user.nickname || "",
      },
      required: false,
      order: 2,
      messages: errors?.nickname
        ? [{ text: errors.nickname, type: "error" as const }]
        : undefined,
    },
    {
      id: "phone_number",
      type: "TEXT",
      category: "FIELD",
      visible: true,
      label: "Phone Number",
      config: {
        placeholder: "Phone Number",
        default_value: user.phone_number || "",
      },
      required: false,
      order: 3,
      messages: errors?.phone_number
        ? [{ text: errors.phone_number, type: "error" as const }]
        : undefined,
    },
    {
      id: "picture",
      type: "TEXT",
      category: "FIELD",
      visible: true,
      label: "Profile Picture URL",
      config: {
        placeholder: "https://example.com/photo.jpg",
        default_value: user.picture || "",
      },
      required: false,
      order: 4,
      messages: errors?.picture
        ? [{ text: errors.picture, type: "error" as const }]
        : undefined,
    },
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: "Save Changes",
      },
      order: 5,
    },
  ];

  const screen: UiScreen = {
    name: "account-profile",
    action: `${routePrefix}/account/profile?state=${stateParam}`,
    method: "POST",
    title: "Edit Profile",
    description: "Update your personal information",
    components,
    links: [
      {
        id: "back-to-account",
        text: "Back to Account",
        href: `${routePrefix}/account?state=${stateParam}`,
      },
    ],
    messages,
  };

  return { screen, branding };
}

/**
 * Handle account-profile form submission
 */
async function handleAccountProfileSubmit(
  context: ScreenContext,
  data: Record<string, unknown>,
): Promise<
  | { screen: ScreenResult }
  | { redirect: string; cookies?: string[] }
  | { error: string; screen: ScreenResult }
  | { response: Response }
> {
  const { ctx, tenant, routePrefix = "/u2", state } = context;

  const { user } = await resolveAccountUser(context);

  const updateData: Record<string, string | undefined> = {};
  if (typeof data.given_name === "string") {
    updateData.given_name = data.given_name.trim() || undefined;
  }
  if (typeof data.family_name === "string") {
    updateData.family_name = data.family_name.trim() || undefined;
  }
  if (typeof data.nickname === "string") {
    updateData.nickname = data.nickname.trim() || undefined;
  }
  if (typeof data.phone_number === "string") {
    updateData.phone_number = data.phone_number.trim() || undefined;
  }
  if (typeof data.picture === "string") {
    updateData.picture = data.picture.trim() || undefined;
  }

  // Build the name from given_name + family_name
  const givenName = updateData.given_name || "";
  const familyName = updateData.family_name || "";
  const fullName = [givenName, familyName].filter(Boolean).join(" ");
  if (fullName) {
    updateData.name = fullName;
  }

  try {
    await ctx.env.data.users.update(tenant.id, user.user_id, updateData);

    return {
      redirect: `${routePrefix}/account?state=${encodeURIComponent(state)}`,
    };
  } catch (err) {
    return {
      error: "Failed to update profile",
      screen: await accountProfileScreen({
        ...context,
        messages: [{ text: "Failed to update profile", type: "error" }],
      }),
    };
  }
}

/**
 * Screen definition for the account-profile screen
 */
export const accountProfileScreenDefinition: ScreenDefinition = {
  id: "account-profile",
  name: "Account Profile",
  description: "Edit personal information",
  handler: {
    get: accountProfileScreen,
    post: handleAccountProfileSubmit,
  },
};
