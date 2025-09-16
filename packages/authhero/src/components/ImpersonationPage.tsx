import type { FC } from "hono/jsx";
import Layout from "./Layout";
import Button from "./Button";
import ErrorMessage from "./ErrorMessage";
import Icon from "./Icon";
import { GoBack } from "./GoBack";
import { LegacyClient, Theme, Branding, User } from "@authhero/adapter-interfaces";
import { html } from "hono/html";

type Props = {
  error?: string;
  theme: Theme | null;
  branding: Branding | null;
  user: User;
  state: string;
  client: LegacyClient;
};

const ImpersonationPage: FC<Props> = (params) => {
  const { error, theme, branding, user, state, client } = params;

  return (
    <Layout
      title="Impersonation"
      theme={theme}
      branding={branding}
      client={client}
    >
      <div className="mb-4 text-lg font-medium sm:text-2xl">
        Impersonation Panel
      </div>
      <div className="mb-6 text-gray-300">
        You have permission to impersonate other users. You can continue with
        your current session or choose to impersonate another user.
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-6">
          <p className="text-sm text-gray-500 mb-4">
            Current user: <strong>{user.email}</strong>
          </p>

          {/* Continue button */}
          <form
            method="post"
            action={`/u/impersonate/continue?state=${encodeURIComponent(state)}`}
            className="mb-4"
          >
            <Button className="w-full !text-base">
              <span>Continue as {user.email}</span>
              <Icon className="text-xs" name="arrow-right" />
            </Button>
          </form>

          {/* Collapsible options section */}
          <details className="mb-4">
            <summary className="cursor-pointer text-primary hover:underline mb-4 select-none">
              <Icon className="text-xs inline mr-1" name="arrow-right" />
              Advanced Options
            </summary>
            <div className="mt-4 p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700">
              <form
                method="post"
                action={`/u/impersonate/switch?state=${encodeURIComponent(state)}`}
              >
                <label
                  htmlFor="user_id"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Impersonate User ID:
                </label>
                <input
                  type="text"
                  id="user_id"
                  name="user_id"
                  placeholder="Enter user ID to impersonate"
                  className="mb-4 w-full rounded-lg bg-gray-100 px-4 py-3 text-base placeholder:text-gray-300 dark:bg-gray-600 md:text-base"
                  required
                />
                {error && <ErrorMessage>{error}</ErrorMessage>}
                <Button variant="secondary" className="w-full !text-base">
                  <span>Impersonate User</span>
                  <Icon className="text-xs" name="arrow-right" />
                </Button>
              </form>
            </div>
          </details>
        </div>

        <GoBack state={state} />
      </div>

      {html`
        <script>
          // Toggle arrow icon on details open/close
          const details = document.querySelector("details");
          const arrow = details.querySelector('[name="arrow-right"]');

          details.addEventListener("toggle", function () {
            if (details.open) {
              arrow.style.transform = "rotate(90deg)";
            } else {
              arrow.style.transform = "rotate(0deg)";
            }
          });
        </script>
      `}
    </Layout>
  );
};

export default ImpersonationPage;
