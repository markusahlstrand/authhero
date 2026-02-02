import type { FC, JSXNode } from "hono/jsx";
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
import Trans from "./Trans";

export interface ContinueFormProps {
  theme?: Theme | null;
  branding?: Branding | null;
  state: string;
  user: User;
  client: EnrichedClient;
  className?: string;
}

const ContinueForm: FC<ContinueFormProps> = ({
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
            {i18next.t("continue_with_account", "Continue with account")}
          </CardTitle>
          <CardDescription style={bodyStyle}>
            <Trans
              i18nKey="currently_logged_in_as"
              components={[
                (
                  <span className="font-semibold" key="span" />
                ) as unknown as JSXNode,
              ]}
              values={{ email: user.email || "" }}
            />
            <br />
            <br />
            {i18next.t(
              "continue_with_sso_provider_headline",
              "Do you want to continue with this account?",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post">
            <div className="grid gap-4">
              <Button
                type="submit"
                className="w-full transition-colors hover:brightness-90"
                style={buttonStyle}
              >
                {i18next.t(
                  "yes_continue_with_existing_account",
                  "Yes, continue",
                )}
              </Button>

              <div className="text-center">
                <a
                  href={`/u/login/identifier?state=${encodeURIComponent(state)}`}
                  className="text-sm hover:underline focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors"
                  style={linkStyle}
                >
                  {i18next.t("no_use_another", "No, use another account")}
                </a>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ContinueForm;
