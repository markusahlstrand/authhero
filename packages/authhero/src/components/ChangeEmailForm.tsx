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
  CardFooter,
} from "./ui/card";
import Button from "./ui/button";
import Label from "./ui/label";
import Input from "./ui/input";
import AppLogo from "./AppLogo";
import ErrorMessage from "./ErrorMessage";

export interface ChangeEmailFormProps {
  error?: string;
  theme?: Theme | null;
  branding?: Branding | null;
  state: string;
  user: User;
  client: EnrichedClient;
  className?: string;
}

const ChangeEmailForm: FC<ChangeEmailFormProps> = ({
  error,
  theme,
  branding,
  state,
  user,
  className,
}) => {
  // Extract theme and branding colors (theme overrides branding)
  const primaryColor =
    theme?.colors?.primary_button || branding?.colors?.primary || "#0066cc";
  const primaryButtonLabel = theme?.colors?.primary_button_label || "#ffffff";
  const bodyText = theme?.colors?.body_text || "#333333";
  const inputBorder = theme?.colors?.input_border || "#d1d5db";
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

  const buttonStyle = {
    backgroundColor: primaryColor,
    color: primaryButtonLabel,
    borderRadius: `${buttonBorderRadius}px`,
  };

  const linkStyle = {
    color: theme?.colors?.links_focused_components || primaryColor,
    fontSize: `${bodySize}px`,
  };

  const inputStyle = {
    borderColor: error ? "#ef4444" : inputBorder,
    borderRadius: `${buttonBorderRadius}px`,
    fontSize: `${bodySize}px`,
    color: bodyText,
    backgroundColor: widgetBackground,
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

  return (
    <div className={cn("flex flex-col gap-6 w-full max-w-sm", className)}>
      <Card style={cardStyle} className="border">
        <CardHeader>
          {showLogo && (
            <div className={cn("mb-4", logoAlignmentClass)}>
              <AppLogo theme={theme} branding={branding} />
            </div>
          )}
          <CardTitle style={titleStyle}>
            {i18next.t("change_email", "Change Email")}
          </CardTitle>
          <CardDescription style={bodyStyle}>
            {i18next.t("change_email_description", "Update your email address")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Current Email Display */}
            <div className="space-y-2">
              <Label style={bodyStyle}>
                {i18next.t("current_email", "Current Email")}
              </Label>
              <div
                className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md"
                style={{ borderRadius: `${buttonBorderRadius}px` }}
              >
                <div
                  className="font-medium"
                  style={{ fontSize: `${bodySize}px`, color: bodyText }}
                >
                  {user.email ||
                    i18next.t("no_email_address", "No email address")}
                </div>
              </div>
            </div>

            {/* New Email Form */}
            <form method="post">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" style={bodyStyle}>
                    {i18next.t("new_email", "New Email")}
                  </Label>
                  <Input
                    type="email"
                    id="email"
                    name="email"
                    placeholder={i18next.t(
                      "enter_new_email",
                      "Enter new email address",
                    )}
                    required
                    style={inputStyle}
                    className={cn("w-full", { "border-red-500": error })}
                  />
                  {error && <ErrorMessage>{error}</ErrorMessage>}
                </div>

                {/* Info Message */}
                <div className="flex gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                  <svg
                    className="w-5 h-5 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    style={{
                      color:
                        theme?.colors?.links_focused_components || "#3b82f6",
                    }}
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="text-sm" style={{ color: bodyText }}>
                    {i18next.t(
                      "new_email_code_info",
                      "We'll send a verification code to your new email address",
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full transition-colors hover:brightness-90"
                  style={buttonStyle}
                >
                  {i18next.t("continue", "Continue")}
                </Button>
              </div>
            </form>
          </div>
        </CardContent>
        <CardFooter>
          <a
            href={`/u/account?state=${encodeURIComponent(state)}`}
            className="text-sm hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors w-full text-center"
            style={linkStyle}
          >
            {i18next.t("go_back", "Go back")}
          </a>
        </CardFooter>
      </Card>
    </div>
  );
};

export default ChangeEmailForm;
