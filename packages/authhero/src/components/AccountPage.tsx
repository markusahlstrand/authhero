import type { FC } from "hono/jsx";
import Layout from "./Layout";
import {
  Theme,
  Branding,
  User,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";
import i18next from "i18next";
import ErrorMessage from "./ErrorMessage";
import PenIcon from "./IconPen";

type Props = {
  theme: Theme | null;
  branding: Branding | null;
  user: User;
  client: EnrichedClient;
  error?: string;
  success?: string;
  state?: string;
  csrfToken?: string;
};

const showLinkedAccounts = false;

const AccountPage: FC<Props> = (params) => {
  const { theme, branding, user, client, error, success, state, csrfToken } =
    params;

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
    >
      <div className="mb-4 text-2xl font-medium">
        {i18next.t("account_title")}
      </div>
      <div className="mb-8 text-gray-300">
        {i18next.t("account_page_description")}
      </div>

      {error && <ErrorMessage className="mb-8">{error}</ErrorMessage>}
      {success && <div className="mb-8 text-green">{success}</div>}

      <div className="column-left gap-6 border-y border-gray-200/50 py-6 mb-8">
        <div className="row-left w-full !justify-between !flex-nowrap gap-4">
          <div className="column-left gap-1.5">
            <div className="text-gray-300">
              {i18next.t("email_placeholder")}
            </div>
            <div className="font-medium text-base text-gray-800 line-clamp-1 break-all">
              {user.email || i18next.t("no_email_address")}
            </div>
          </div>
          <a
            className="bg-gray-200/40 p-2 rounded-md hover:bg-gray-200/75"
            title={i18next.t("edit")}
            aria-label={i18next.t("edit")}
            href={
              state
                ? `/u/account/change-email?state=${encodeURIComponent(state)}`
                : `/u/account/change-email?client_id=${encodeURIComponent(client.client_id)}`
            }
          >
            <PenIcon />
          </a>
        </div>

        {showLinkedAccounts && linkedIdentities.length > 0 && (
          <>
            <hr className="border-t border-gray-200/50 w-full" />
            <div className="column-left w-full gap-1.5">
              <div className="text-gray-300">
                {i18next.t("linked_accounts")}
              </div>
              <div className="space-y-2 w-full">
                {linkedIdentities.map((identity, index) => (
                  <div
                    key={`linked-identity-${index}`}
                    className="row w-full !justify-between !flex-nowrap gap-2"
                  >
                    <div className="text-gray-800 line-clamp-1 break-all">
                      <span className="text-gray-400">
                        {identity.provider === "google-oauth2"
                          ? "Google"
                          : identity.provider}
                      </span>{" "}
                      <span className="font-medium">
                        {identity.profileData?.email || identity.user_id}
                      </span>
                    </div>

                    <form method="post" className="inline">
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
                      {csrfToken && (
                        <input
                          type="hidden"
                          name="csrf_token"
                          value={csrfToken}
                        />
                      )}
                      <button
                        type="submit"
                        className="bg-red/80 hover:bg-red/90 px-2 py-1.5 text-white font-bold rounded-md !text-xs"
                      >
                        {i18next.t("unlink")}
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default AccountPage;
