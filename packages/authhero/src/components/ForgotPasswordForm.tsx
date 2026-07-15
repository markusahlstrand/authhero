import type { FC } from "hono/jsx";
import { LoginSession, Theme, Branding } from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import i18next from "i18next";
import Input from "./ui/input";
import Button from "./ui/button";
import Label from "./ui/label";
import ErrorMessage from "./ErrorMessage";
import AuthCard from "./AuthCard";
import { getThemeStyles } from "./auth-form-styles";

type Props = {
  error?: string;
  theme?: Theme | null;
  branding?: Branding | null;
  loginSession: LoginSession;
  email?: string;
  client: EnrichedClient;
  className?: string;
};

const ForgotPasswordForm: FC<Props> = ({
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
      title={i18next.t("forgot_password_title", "Forgot Password")}
      description={i18next.t(
        "forgot_password_description",
        "Enter your email address and we'll send you a link to reset your password.",
      )}
    >
      <form method="post" className="space-y-4">
        <input type="hidden" name="state" value={loginSession.authParams.state} />

        <div className="space-y-2">
          <Label
            htmlFor="username"
            style={bodyStyle}
            className="text-sm font-medium"
          >
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

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <Button
          type="submit"
          className="w-full"
          style={buttonStyle}
          disabled={false}
        >
          {i18next.t("forgot_password_cta", "Send Reset Link")}
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

export default ForgotPasswordForm;
