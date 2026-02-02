import type { FC } from "hono/jsx";
import {
  Theme,
  Branding,
  User,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import i18next from "i18next";
import cn from "classnames";
import Card, {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import Button from "./ui/button";
import AppLogo from "./AppLogo";
import ErrorMessage from "./ErrorMessage";

export interface AccountFormProps {
  error?: string;
  success?: string;
  theme?: Theme | null;
  branding?: Branding | null;
  state?: string;
  user: User;
  client: EnrichedClient;
  className?: string;
  showLinkedAccounts?: boolean;
  csrfToken?: string;
}

const AccountForm: FC<AccountFormProps> = ({
  error,
  success,
  theme,
  branding,
  state,
  user,
  client,
  className,
  showLinkedAccounts = false,
  csrfToken,
}) => {
  // Extract theme and branding colors (theme overrides branding)
  const primaryColor =
    theme?.colors?.primary_button || branding?.colors?.primary || "#0066cc";
  const bodyText = theme?.colors?.body_text || "#333333";
  const widgetBackground = theme?.colors?.widget_background || "#ffffff";
  const widgetBorder = theme?.colors?.widget_border || "#e5e7eb";

  // Extract border settings
  const borderRadius = theme?.borders?.widget_corner_radius || 8;
  const buttonBorderRadius = theme?.borders?.button_border_radius || 4;
  const showShadow = theme?.borders?.show_widget_shadow ?? true;

  // Extract font settings
  const titleSize = theme?.fonts?.title?.size || 24;
  const titleBold = theme?.fonts?.title?.bold ?? true;
  const bodySize = theme?.fonts?.body_text?.size || 14;

  // Build inline styles for theming
  const cardStyle = {
    backgroundColor: widgetBackground,
    borderColor: widgetBorder,
    borderRadius: `${borderRadius}px`,
    boxShadow: showShadow ? "0 1px 3px 0 rgba(0, 0, 0, 0.1)" : "none",
    color: bodyText,
  };

  const titleStyle = {
    fontSize: `${titleSize}px`,
    fontWeight: titleBold ? "700" : "400",
    color: theme?.colors?.header || bodyText,
  };

  const bodyStyle = {
    fontSize: `${bodySize}px`,
    color: theme?.colors?.input_labels_placeholders || "#6b7280",
  };

  const linkStyle = {
    color: theme?.colors?.links_focused_components || primaryColor,
    fontSize: `${bodySize}px`,
  };

  const successStyle = {
    color: "#10b981",
    fontSize: `${bodySize}px`,
  };

  // Determine logo alignment based on theme
  const logoPosition = theme?.widget?.logo_position || "center";
  const logoAlignmentClass =
    logoPosition === "left"
      ? "text-left"
      : logoPosition === "right"
        ? "text-right"
        : "text-center";

  // Check if logo should be displayed
  const logoUrl = theme?.widget?.logo_url || branding?.logo_url;
  const showLogo = logoPosition !== "none" && logoUrl;

  // Get linked identities - exclude the primary identity
  // Handle both formats: "provider|user_id" and "user_id"
  const primaryUserId = user.user_id.includes("|")
    ? user.user_id.split("|")[1]
    : user.user_id;

  const linkedIdentities =
    user.identities?.filter(
      (identity) =>
        !(
          identity.provider === user.provider &&
          identity.user_id === primaryUserId
        ),
    ) || [];

  const changeEmailUrl = state
    ? `/u/account/change-email?state=${encodeURIComponent(state)}`
    : `/u/account/change-email?client_id=${encodeURIComponent(client.client_id)}`;

  return (
    <div className={cn("flex flex-col gap-6 w-full max-w-md", className)}>
      <Card style={cardStyle} className="border">
        <CardHeader>
          {showLogo && (
            <div className={cn("mb-4", logoAlignmentClass)}>
              <AppLogo theme={theme} branding={branding} />
            </div>
          )}
          <CardTitle style={titleStyle}>
            {i18next.t("account_title", "Account Settings")}
          </CardTitle>
          <CardDescription style={bodyStyle}>
            {i18next.t(
              "account_page_description",
              "Manage your account information and settings",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {error && <ErrorMessage>{error}</ErrorMessage>}
            {success && (
              <div
                className="p-3 bg-green-50 dark:bg-green-900/20 rounded-md"
                style={successStyle}
              >
                {success}
              </div>
            )}

            {/* Email Section */}
            <div className="space-y-3">
              <div
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-md border"
                style={{ borderColor: widgetBorder }}
              >
                <div className="flex-1 min-w-0 mr-4">
                  <div className="text-xs mb-1" style={bodyStyle}>
                    {i18next.t("email_placeholder", "Email")}
                  </div>
                  <div
                    className="font-medium truncate"
                    style={{ fontSize: `${bodySize}px`, color: bodyText }}
                  >
                    {user.email ||
                      i18next.t("no_email_address", "No email address")}
                  </div>
                </div>
                <a
                  href={changeEmailUrl}
                  className="flex-shrink-0 p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
                  title={i18next.t("edit", "Edit")}
                  aria-label={i18next.t("edit", "Edit")}
                  style={{ borderRadius: `${buttonBorderRadius}px` }}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    style={{ color: linkStyle.color }}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </a>
              </div>
            </div>

            {/* Linked Accounts Section */}
            {showLinkedAccounts && linkedIdentities.length > 0 && (
              <div className="space-y-3">
                <div
                  className="border-t pt-4"
                  style={{ borderColor: widgetBorder }}
                >
                  <div className="text-sm mb-3" style={bodyStyle}>
                    {i18next.t("linked_accounts", "Linked Accounts")}
                  </div>
                  <div className="space-y-2">
                    {linkedIdentities.map((identity, index) => (
                      <div
                        key={`linked-identity-${index}`}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-md border"
                        style={{ borderColor: widgetBorder }}
                      >
                        <div className="flex-1 min-w-0 mr-4">
                          <div className="text-xs mb-1" style={bodyStyle}>
                            {identity.provider === "google-oauth2"
                              ? "Google"
                              : identity.provider}
                          </div>
                          <div
                            className="font-medium truncate"
                            style={{
                              fontSize: `${bodySize}px`,
                              color: bodyText,
                            }}
                          >
                            {identity.profileData?.email || identity.user_id}
                          </div>
                        </div>
                        <form method="post" className="flex-shrink-0">
                          <input
                            type="hidden"
                            name="action"
                            value="unlink_account"
                          />
                          <input
                            type="hidden"
                            name="provider"
                            value={identity.provider}
                          />
                          <input
                            type="hidden"
                            name="user_id"
                            value={identity.user_id}
                          />
                          {csrfToken && (
                            <input
                              type="hidden"
                              name="csrf_token"
                              value={csrfToken}
                            />
                          )}
                          <Button
                            type="submit"
                            variant="outline"
                            className="text-xs px-3 py-1.5 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                          >
                            {i18next.t("unlink", "Unlink")}
                          </Button>
                        </form>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccountForm;
