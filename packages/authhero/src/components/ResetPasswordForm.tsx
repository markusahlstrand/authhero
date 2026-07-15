import type { FC } from "hono/jsx";
import { LoginSession, Theme, Branding } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import i18next from "i18next";
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

const ResetPasswordForm: FC<Props> = ({
  error,
  theme,
  branding,
  loginSession,
  email,
  className,
}) => {
  const styles = getThemeStyles(theme, branding, error);
  const { bodyStyle, inputStyle, buttonStyle } = styles;

  return (
    <AuthCard
      styles={styles}
      theme={theme}
      branding={branding}
      className={className}
      title={i18next.t("reset_password_title", "Reset Password")}
      description={`${i18next.t("reset_password_description", "Set a new password for")} ${email}`}
    >
      <form method="post" className="space-y-4">
        <input type="hidden" name="state" value={loginSession.authParams.state} />

        {/* New Password Field */}
        <div className="space-y-2">
          <Label htmlFor="password" style={bodyStyle}>
            {i18next.t("new_password", "New Password")}
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
          {i18next.t("reset_password_cta", "Reset Password")}
        </Button>
      </form>
    </AuthCard>
  );
};

export default ResetPasswordForm;
