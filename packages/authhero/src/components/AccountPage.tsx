import type { FC } from "hono/jsx";
import Layout from "./Layout";
import { VendorSettings, User, Client } from "@authhero/adapter-interfaces";
import i18next from "i18next";
import Button from "./Button";
import ErrorMessage from "./ErrorMessage";

type Props = {
  vendorSettings: VendorSettings;
  user: User;
  client: Client;
  state: string;
  error?: string;
  success?: string;
};

const AccountPage: FC<Props> = (params) => {
  const { vendorSettings, user, state, error, success } = params;

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
      vendorSettings={vendorSettings}
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
              {i18next.t("current_email") || "Current Email"}
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
              </div>
            </div>
          </div>

          {/* Update Email Section */}
          <div className="mb-6">
            <h2 className="mb-3 text-lg font-medium text-gray-900">
              {i18next.t("update_email") || "Update Email"}
            </h2>
            <form method="post" action={`/u/account?state=${state}`}>
              <input type="hidden" name="action" value="update_email" />
              <div className="mb-4">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  {i18next.t("new_email") || "New Email Address"}
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={
                    i18next.t("enter_new_email") || "Enter new email address"
                  }
                />
              </div>
              <Button variant="primary" className="w-full">
                {i18next.t("update_email") || "Update Email"}
              </Button>
            </form>
          </div>

          {/* Linked Accounts Section */}
          {linkedIdentities.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-3 text-lg font-medium text-gray-900">
                {i18next.t("linked_accounts") || "Linked Social Accounts"}
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
                        action={`/u/account?state=${state}`}
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

          {/* Account Information */}
          <div className="mb-6">
            <h2 className="mb-3 text-lg font-medium text-gray-900">
              {i18next.t("account_information") || "Account Information"}
            </h2>
            <div className="rounded-lg border border-gray-200 p-4 space-y-2">
              {user.name && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">
                    {i18next.t("name") || "Name"}:
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {user.name}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">
                  {i18next.t("user_id") || "User ID"}:
                </span>
                <span className="text-sm font-mono text-gray-900">
                  {user.user_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">
                  {i18next.t("login_count") || "Login Count"}:
                </span>
                <span className="text-sm text-gray-900">
                  {user.login_count}
                </span>
              </div>
              {user.last_login && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">
                    {i18next.t("last_login") || "Last Login"}:
                  </span>
                  <span className="text-sm text-gray-900">
                    {new Date(user.last_login).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AccountPage;
