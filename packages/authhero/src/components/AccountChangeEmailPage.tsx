import type { FC } from "hono/jsx";
import Layout from "./Layout";
import { Theme, Branding, User, Client } from "@authhero/adapter-interfaces";
import i18next from "i18next";
import Button from "./Button";
import ErrorMessage from "./ErrorMessage";

type Props = {
  theme: Theme | null;
  branding: Branding | null;
  user: User;
  client: Client;
  state: string;
  error?: string;
  success?: string;
};

const AccountChangeEmailPage: FC<Props> = (params) => {
  const { theme, branding, user, client, state, error, success } = params;

  return (
    <Layout
      title={i18next.t("change_email") || "Change Email"}
      theme={theme}
      branding={branding}
      client={client}
      hideFooter={true}
    >
      <div className="flex flex-1 flex-col justify-center">
        <div className="mx-auto w-full max-w-sm">
          {/* Header */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">
              {i18next.t("change_email") || "Change Email"}
            </h1>
          </div>

          {error && <ErrorMessage>{error}</ErrorMessage>}
          {success && (
            <div className="mb-4 rounded-md bg-green-50 p-4">
              <div className="text-sm text-green-700">{success}</div>
            </div>
          )}

          {/* Current Email Section */}
          <div className="mb-6">
            <h2 className="mb-3 text-lg font-medium text-gray-900">
              {i18next.t("current_email") || "Current Email"}
            </h2>
            <p className="text-sm font-medium text-gray-900">
              {user.email || "No email set"}
            </p>
          </div>

          {/* New Email Form */}
          <div className="mb-6">
            <h2 className="mb-3 text-lg font-medium text-gray-900">
              {i18next.t("new_email") || "New Email"}
            </h2>
            <form method="post">
              <div className="mb-4">
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  autoFocus
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={
                    i18next.t("enter_new_email") || "Enter new email address"
                  }
                />
              </div>
              <Button variant="primary" className="w-full">
                {i18next.t("send_code") || "Send Verification Code"}
              </Button>
            </form>
          </div>

          {/* Go Back Link */}
          <a
            className="block text-primary hover:text-primaryHover text-center"
            href={`/u/account?state=${encodeURIComponent(state)}`}
          >
            {i18next.t("go_back")}
          </a>
        </div>
      </div>
    </Layout>
  );
};

export default AccountChangeEmailPage;
