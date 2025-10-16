import type { FC, JSXNode } from "hono/jsx";
import { Theme, Branding } from "@authhero/adapter-interfaces";
import i18next from "i18next";
import cn from "classnames";
import Card, {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import { InputOTP } from "./ui/input-otp";
import Button from "./ui/button";
import Label from "./ui/label";
import ErrorMessage from "./ErrorMessage";
import AppLogo from "./AppLogo";
import Trans from "./Trans";
import { GoBack } from "./GoBack";

type Props = {
  error?: string;
  theme?: Theme | null;
  branding?: Branding | null;
  email: string;
  state: string;
  hasPasswordLogin: boolean;
  className?: string;
};

const CODE_LENGTH = 6;

const EnterCodeForm: FC<Props> = ({
  error,
  theme,
  branding,
  email,
  state,
  hasPasswordLogin,
  className,
}) => {
  const passwordLoginLinkParams = new URLSearchParams({
    state,
  });

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
            {i18next.t("verify_your_email", "Verify your email")}
          </CardTitle>
          <CardDescription style={bodyStyle}>
            <Trans
              i18nKey="code_sent_template"
              components={[
                (
                  <span className="font-medium" key="span" />
                ) as unknown as JSXNode,
              ]}
              values={{
                username: email,
              }}
            />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="post">
            <div className="grid gap-6">
              <div className="grid gap-4">
                <Label htmlFor="code" style={bodyStyle}>
                  {i18next.t("verification_code", "Verification Code")}
                </Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={CODE_LENGTH}
                    name="code"
                    id="code"
                    required
                    autoFocus
                    containerClassName="gap-2"
                    className={cn(
                      "w-12 h-12 text-center text-lg font-mono border rounded-md transition-colors",
                      error
                        ? "border-red-500 focus:ring-red-500"
                        : "border-gray-300 focus:ring-blue-500 focus:border-blue-500",
                    )}
                  />
                </div>
                {error && <ErrorMessage>{error}</ErrorMessage>}
              </div>

              <Button
                type="submit"
                className="w-full transition-colors hover:brightness-90"
                style={buttonStyle}
              >
                {i18next.t("login", "Login")}
              </Button>

              <div className="text-center text-xs text-gray-500">
                <div className="flex items-center justify-center gap-1">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>
                    {i18next.t(
                      "sent_code_spam",
                      "Check your spam folder if you don't see the code",
                    )}
                  </span>
                </div>
              </div>

              {hasPasswordLogin && (
                <div className="text-center">
                  <div
                    className="relative mb-5 block text-center"
                    style={bodyStyle}
                  >
                    <div
                      className="absolute left-0 right-0 top-1/2 border-b"
                      style={{ borderColor: widgetBorder }}
                    />
                    <div
                      className="relative inline-block px-2"
                      style={{ backgroundColor: widgetBackground }}
                    >
                      {i18next.t("or", "Or")}
                    </div>
                  </div>
                  <a
                    href={`/u/${hasPasswordLogin ? "enter-password" : "pre-signup"}?${passwordLoginLinkParams.toString()}`}
                    className={cn(
                      "w-full inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      "border border-gray-300 bg-transparent hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800",
                      "h-10 px-4 py-2",
                    )}
                    style={{
                      borderColor: inputBorder,
                      borderRadius: `${buttonBorderRadius}px`,
                      color: bodyText,
                    }}
                  >
                    {i18next.t(
                      "enter_your_password_btn",
                      "Enter your password instead",
                    )}
                  </a>
                </div>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
      <GoBack state={state} />
    </div>
  );
};

export default EnterCodeForm;
