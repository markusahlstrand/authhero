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
  email: string;
  client: EnrichedClient;
  className?: string;
};

const EnterPasswordForm: FC<Props> = ({
  error,
  theme,
  branding,
  loginSession,
  email,
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
      title={i18next.t("enter_password", "Enter your password")}
      description={i18next.t(
        "enter_password_description",
        "Enter your password to continue",
      )}
    >
      <form method="post">
        <div className="grid gap-6">
          {/* Email Field (read-only) */}
          <div className="grid gap-2">
            <Label htmlFor="email" style={bodyStyle}>
              {i18next.t("email", "Email")}
            </Label>
            <Input
              id="email"
              name="username"
              type="email"
              value={email}
              disabled
              className="border bg-gray-50"
              style={{ ...inputStyle, cursor: "not-allowed" }}
            />
          </div>

          {/* Password Field with Toggle */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" style={bodyStyle}>
                {i18next.t("password", "Password")}
              </Label>
              <a
                href={`/u/forgot-password?state=${loginSession.id}`}
                className="text-sm hover:underline"
                style={{ color: primaryColor }}
              >
                {i18next.t("forgot_password", "Forgot password?")}
              </a>
            </div>

            {/* Password input with toggle - uses data attributes for client-side hydration */}
            <PasswordField
              id="password"
              name="password"
              placeholder={i18next.t(
                "password_placeholder",
                "Enter your password",
              )}
              error={!!error}
              style={inputStyle}
            />

            {error && <ErrorMessage>{error}</ErrorMessage>}
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full transition-colors hover:brightness-90"
            style={buttonStyle}
          >
            {i18next.t("continue", "Continue")}
          </Button>

          {/* Back Link */}
          <div className="text-center">
            <a
              href={`/u/login/identifier?state=${loginSession.id}`}
              className="text-sm hover:underline"
              style={bodyStyle}
            >
              ← {i18next.t("back", "Back")}
            </a>
          </div>
        </div>
      </form>
    </AuthCard>
  );
};

export default EnterPasswordForm;
