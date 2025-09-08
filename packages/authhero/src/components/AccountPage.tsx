import type { FC } from "hono/jsx";
import Layout from "./Layout";
import { Theme, Branding, User, Client } from "@authhero/adapter-interfaces";
import i18next from "i18next";
import Button from "./Button";
import ErrorMessage from "./ErrorMessage";
import Icon from "./Icon";

type Props = {
  theme: Theme | null;
  branding: Branding | null;
  user: User;
  client: Client;
  error?: string;
  success?: string;
  state?: string;
};

const showLinkedAccounts = false;

const AccountPage: FC<Props> = (params) => {
  const { theme, branding, user, client, error, success, state } = params;

  const linkedIdentities =
    user.identities?.filter(
      (identity) =>
        !(
          identity.provider === user.provider &&
          identity.user_id === user.user_id.split("|")[1]
        ),
    ) || [];

  return (
    <Layout
      title={i18next.t("account_title") || "Account Settings"}
      theme={theme}
      branding={branding}
      client={client}
      hideFooter={true}
    >
      <div className="flex flex-1 flex-col justify-center">
        <div className="mx-auto w-full max-w-sm">
          <div className="text-center">
            <h1 className="mb-6 text-2xl font-semibold text-gray-900">
              {i18next.t("account_title") || "Account Settings"}
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
              {i18next.t("email")}
            </h2>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {user.email || "No email set"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {user.email_verified
                      ? i18next.t("verified") || "Verified"
                      : i18next.t("unverified") || "Unverified"}
                  </p>
                </div>
                <Button
                  Component="a"
                  href={
                    state
                      ? `/u/account/change-email?state=${encodeURIComponent(state)}`
                      : `/u/account/change-email?client_id=${encodeURIComponent(client.id)}`
                  }
                  variant="secondary"
                  className="text-xs px-3 py-1 flex items-center gap-1"
                >
                  <Icon name="edit" className="text-xs" />
                  {i18next.t("edit") || "Edit"}
                </Button>
              </div>
            </div>
          </div>

          {/* Linked Accounts Section */}
          {showLinkedAccounts && linkedIdentities.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-lg font-medium text-gray-900">
                {i18next.t("linked_accounts")}
              </h2>
              <div className="space-y-3">
                {linkedIdentities.map((identity, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-gray-200 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900 capitalize">
                          {identity.provider === "google-oauth2"
                            ? "Google"
                            : identity.provider}
                        </p>
                        <p className="text-xs text-gray-500">
                          {identity.profileData?.email || identity.user_id}
                        </p>
                        {identity.isSocial && (
                          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 mt-1">
                            {i18next.t("social_account") || "Social Account"}
                          </span>
                        )}
                      </div>
                      <form
                        method="post"
                        className="inline"
                        onsubmit="return confirm('{i18next.t('confirm_unlink') || 'Are you sure you want to unlink this account?'}')"
                      >
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
                        <Button
                          variant="secondary"
                          className="text-xs px-3 py-1"
                        >
                          {i18next.t("unlink") || "Unlink"}
                        </Button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default AccountPage;
