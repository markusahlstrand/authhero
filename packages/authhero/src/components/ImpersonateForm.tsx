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

export interface ImpersonateFormProps {
  error?: string;
  theme?: Theme | null;
  branding?: Branding | null;
  state: string;
  user: User;
  client: EnrichedClient;
  className?: string;
}

const ImpersonateForm: FC<ImpersonateFormProps> = ({
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

  const secondaryButtonStyle = {
    backgroundColor: "transparent",
    color: bodyText,
    borderColor: inputBorder,
    borderRadius: `${buttonBorderRadius}px`,
  };

  const linkStyle = {
    color: theme?.colors?.links_focused_components || primaryColor,
    fontSize: `${bodySize}px`,
  };

  const inputStyle = {
    borderColor: inputBorder,
    borderRadius: `${buttonBorderRadius}px`,
    fontSize: `${bodySize}px`,
    color: bodyText,
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
            {i18next.t("impersonation", "Impersonation")}
          </CardTitle>
          <CardDescription style={bodyStyle}>
            {i18next.t(
              "impersonation_description",
              "You have permission to impersonate other users.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Current user info */}
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                {i18next.t("current_user", "Current user")}:
              </p>
              <p
                className="font-semibold"
                style={{ fontSize: `${bodySize}px` }}
              >
                {user.email}
              </p>
            </div>

            {/* Continue as current user */}
            <form
              method="post"
              action={`/u/impersonate/continue?state=${encodeURIComponent(state)}`}
            >
              <Button
                type="submit"
                className="w-full transition-colors hover:brightness-90"
                style={buttonStyle}
              >
                {i18next.t("continue", "Continue")}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative">
              <div
                className="absolute inset-0 flex items-center"
                aria-hidden="true"
              >
                <div
                  className="w-full border-t"
                  style={{ borderColor: widgetBorder }}
                />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span
                  className="px-2"
                  style={{ backgroundColor: widgetBackground, ...bodyStyle }}
                >
                  {i18next.t("or", "Or")}
                </span>
              </div>
            </div>

            {/* Impersonate another user */}
            <details className="group">
              <summary
                className="cursor-pointer select-none flex items-center justify-between p-3 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                style={linkStyle}
              >
                <span className="font-medium">
                  {i18next.t("advanced_options", "Advanced Options")}
                </span>
                <svg
                  className="w-5 h-5 transition-transform group-open:rotate-90"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </summary>
              <div
                className="mt-3 p-4 border rounded-md"
                style={{ borderColor: widgetBorder }}
              >
                <form
                  method="post"
                  action={`/u/impersonate/switch?state=${encodeURIComponent(state)}`}
                >
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="user_id" style={bodyStyle}>
                        {i18next.t(
                          "user_id_to_impersonate",
                          "User ID to Impersonate",
                        )}
                      </Label>
                      <Input
                        type="text"
                        id="user_id"
                        name="user_id"
                        placeholder={i18next.t(
                          "enter_user_id",
                          "Enter user ID",
                        )}
                        required
                        style={inputStyle}
                        className="w-full"
                      />
                      {error && <ErrorMessage>{error}</ErrorMessage>}
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      className="w-full transition-colors border"
                      style={secondaryButtonStyle}
                    >
                      {i18next.t("impersonate_user", "Impersonate User")}
                    </Button>
                  </div>
                </form>
              </div>
            </details>
          </div>
        </CardContent>
        <CardFooter>
          <a
            href={`/u/login/identifier?state=${encodeURIComponent(state)}`}
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

export default ImpersonateForm;
