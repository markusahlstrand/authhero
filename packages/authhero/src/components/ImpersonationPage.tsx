import type { FC } from "hono/jsx";
import Layout from "./Layout";
import Button from "./Button";
import ErrorMessage from "./ErrorMessage";
import Icon from "./Icon";
import { GoBack } from "./GoBack";
import {
  Theme,
  Branding,
  User,
} from "@authhero/adapter-interfaces";
import { EnrichedClient } from "../helpers/client";

type Props = {
  error?: string;
  theme: Theme | null;
  branding: Branding | null;
  user: User;
  state: string;
  client: EnrichedClient;
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
              <span>Continue</span>
              <Icon className="text-xs" name="arrow-right" />
            </Button>
          </form>

          {/* Collapsible options section */}
          <details className="mb-4">
            <summary className="cursor-pointer text-primary hover:underline mb-4 select-none flex items-center">
              <span className="details-arrow mr-2 transition-transform duration-200">
                ▶
              </span>
              Advanced Options
            </summary>
            <div className="mt-4 p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700">
              <form
                method="post"
                action={`/u/impersonate/switch?state=${encodeURIComponent(state)}`}
              >
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
                  <span>Impersonate</span>
                  <Icon className="text-xs" name="arrow-right" />
                </Button>
              </form>
            </div>
          </details>
        </div>

        <GoBack state={state} />
      </div>

      <style>{`
        details[open] .details-arrow {
          transform: rotate(90deg);
        }
        
        /* Hide default details marker */
        details > summary {
          list-style: none;
        }
        
        details > summary::-webkit-details-marker {
          display: none;
        }
      `}</style>
    </Layout>
  );
};

export default ImpersonationPage;
