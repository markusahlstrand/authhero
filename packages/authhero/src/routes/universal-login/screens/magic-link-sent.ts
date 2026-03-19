/**
 * Magic Link Sent screen
 *
 * Shown after a magic link has been sent to the user's email.
 * Tells the user to check their email and click the link to log in.
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult } from "./types";
import { escapeHtml } from "../sanitization-utils";
import { createTranslation } from "../../../i18n";

/**
 * Create the magic-link-sent screen
 */
export async function magicLinkSentScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, messages, data, customText, routePrefix } = context;

  const locale = context.language || "en";
  const { m } = createTranslation(
    locale,
    customText,
    undefined,
    "magic-link-sent",
  );

  const email = data?.email as string | undefined;
  const maskedEmail = email ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3") : "";

  const description = maskedEmail
    ? m.code_sent_template({
        username: `<strong>${escapeHtml(maskedEmail)}</strong>`,
      })
    : m.link_email_click_to_login();

  const components: FormNodeComponent[] = [
    // Spam reminder
    {
      id: "spam-reminder",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<p>${m.sent_code_spam()}</p>`,
      },
      order: 0,
    },
    // Resend link button
    {
      id: "resend",
      type: "RESEND_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: m.send_me_a_new_magic_link(),
      },
      order: 1,
    },
  ];

  // Back link
  const hasPasswordConnection = context.connections.some(
    (c) => c.strategy === "Username-Password-Authentication",
  );
  const backPath = hasPasswordConnection
    ? `${routePrefix}/login/identifier`
    : `${routePrefix}/login/login-passwordless-identifier`;

  const screen: UiScreen = {
    name: "magic-link-sent",
    action: `${routePrefix}/login/magic-link-sent?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.check_email_title(),
    description,
    components,
    messages: messages?.map((msg) => ({ text: msg.text, type: msg.type })),
    links: [
      {
        id: "back",
        text: "",
        linkText: m.go_back(),
        href: `${backPath}?state=${encodeURIComponent(state)}`,
      },
    ],
  };

  return {
    screen,
    branding,
  };
}
