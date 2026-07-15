import type { FC } from "hono/jsx";
import { LoginSession, Theme, Branding } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import i18next from "i18next";
import Input from "./ui/input";
import Button from "./ui/button";
import Label from "./ui/label";
import ErrorMessage from "./ErrorMessage";
import AuthCard from "./AuthCard";
import PasswordField from "./PasswordField";
import { getThemeStyles } from "./auth-form-styles";

type Props = {
  error?: string;
  theme?: Theme | null;
  branding?: Branding | null;
  loginSession: LoginSession;
  email?: string;
  code?: string;
  client: EnrichedClient;
  className?: string;
};

const SignUpForm: FC<Props> = ({
  error,
  theme,
  branding,
  loginSession,
  email,
  code,
  className,
}) => {
  const styles = getThemeStyles(theme, branding, error);
  const { bodyStyle, inputStyle, buttonStyle, primaryColor } = styles;

  return (
    <AuthCard
      styles={styles}
      theme={theme}
      branding={branding}
      className={className}
      title={i18next.t("create_account_title", "Create Account")}
      description={i18next.t("create_account_description", "Sign up to get started")}
    >
      <form method="post" className="space-y-4">
        <input type="hidden" name="state" value={loginSession.authParams.state} />
        {code && <input type="hidden" name="code" value={code} />}

        {/* Email Field */}
        <div className="space-y-2">
          <Label htmlFor="username" style={bodyStyle}>
            {i18next.t("email_label", "Email")}
          </Label>
          <Input
            id="username"
            type="email"
            name="username"
            placeholder={i18next.t("email_placeholder", "Email Address")}
            value={email}
            disabled={!!email}
            style={inputStyle}
            className="w-full"
            required
          />
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <Label htmlFor="password" style={bodyStyle}>
            {i18next.t("password", "Password")}
          </Label>
          <PasswordField
            id="password"
            name="password"
            placeholder={i18next.t(
              "enter_new_password_placeholder",
              "Enter new password",
            )}
            error={!!error}
            style={inputStyle}
          />
        </div>

        {/* Confirm Password Field */}
        <div className="space-y-2">
          <Label htmlFor="re-enter-password" style={bodyStyle}>
            {i18next.t("confirm_password", "Confirm Password")}
          </Label>
          <PasswordField
            id="re-enter-password"
            name="re-enter-password"
            placeholder={i18next.t(
              "reenter_new_password_placeholder",
              "Re-enter new password",
            )}
            error={!!error}
            style={inputStyle}
          />
        </div>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <Button
          type="submit"
          className="w-full"
          style={buttonStyle}
          disabled={false}
        >
          {i18next.t("continue", "Continue")}
        </Button>
      </form>

      <div className="mt-4 text-center">
        <a
          href={`/u/login/identifier?state=${encodeURIComponent(loginSession.authParams.state || "")}`}
          className="text-sm"
          style={{ color: primaryColor }}
        >
          {i18next.t("back_to_login", "Back to Login")}
        </a>
      </div>
    </AuthCard>
  );
};

export default SignUpForm;
