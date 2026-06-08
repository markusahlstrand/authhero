import {
  TextInput,
  BooleanInput,
  SelectInput,
  ArrayInput,
  SimpleFormIterator,
} from "@/components/admin";
import { useWatch } from "react-hook-form";
import { SecretInput } from "@/common/SecretInput";
import { Strategy } from "@/utils/Strategy";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const isDbConnection = (strategy?: string) =>
  strategy === Strategy.USERNAME_PASSWORD;

// Strategies that don't have a registered redirect handler in authhero's
// findHrdConnection eligibility check, so HRD can't route to them.
const NON_HRD_STRATEGIES = new Set<string>([
  Strategy.USERNAME_PASSWORD,
  Strategy.EMAIL,
  Strategy.SMS,
  Strategy.SAMLP,
  Strategy.ADFS,
]);

const isHrdEligibleStrategy = (strategy?: string) =>
  !!strategy && !NON_HRD_STRATEGIES.has(strategy);

function ImportModeConfiguration() {
  const importMode = useWatch({ name: "options.import_mode" });
  if (!importMode) return null;
  return (
    <Card className="mt-2">
      <CardHeader>
        <CardTitle>Upstream Auth Server (migration)</CardTitle>
        <CardDescription>
          Credentials of the upstream OIDC auth server (Auth0, Cognito, etc.) to
          verify passwords against when Import Mode is enabled. The connection's
          name is sent as the <code>realm</code> in the password-realm grant —
          the upstream client must have the password grant type enabled.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <TextInput
          source="options.configuration.token_endpoint"
          label="Token Endpoint"
          helperText="Upstream token endpoint URL (e.g. https://example.auth0.com/oauth/token)"
        />
        <TextInput
          source="options.configuration.userinfo_endpoint"
          label="Userinfo Endpoint"
          helperText="Upstream userinfo endpoint URL — called after a successful password-realm grant to populate the local user profile"
        />
        <TextInput source="options.configuration.client_id" label="Client ID" />
        <SecretInput
          source="options.configuration.client_secret"
          label="Client Secret"
        />
        <TextInput
          source="options.configuration.realm"
          label="Realm"
          helperText="Optional. Overrides the realm sent in the password-realm grant (defaults to the connection name)."
        />
      </CardContent>
    </Card>
  );
}

export function DetailsTab() {
  const strategy = useWatch({ name: "strategy" }) as string | undefined;
  const isDb = isDbConnection(strategy);

  return (
    <>
      <TextInput source="id" readOnly />
      <TextInput source="name" />
      <TextInput source="strategy" readOnly />
      <TextInput
        source="display_name"
        label="Display Name"
        helperText="Custom display name for the login button (optional)"
      />

      {!isDb && (
        <>
          <TextInput source="options.client_id" label="Client ID" />
          <SecretInput source="options.client_secret" label="Client Secret" />
          <TextInput
            source="options.callback_url"
            label="Callback URL Override"
            helperText="Optional. Pin the redirect_uri sent to the upstream IdP. Leave blank to use the request's host (custom domain or default). Must be registered as an allowed redirect URI at the upstream IdP."
          />
        </>
      )}

      {strategy === "apple" && (
        <>
          <TextInput source="options.kid" label="Key ID" />
          <TextInput source="options.team_id" label="Team ID" />
          <TextInput source="options.realms" label="Realms" />
          <SecretInput source="options.app_secret" label="App Secret" />
          <TextInput source="options.scope" label="Scope" />
        </>
      )}

      {strategy === "github" && (
        <TextInput
          source="options.scope"
          label="Scope"
          helperText="Space-separated scopes (e.g., user:email read:user)"
        />
      )}

      {strategy === "windowslive" && (
        <TextInput
          source="options.scope"
          label="Scope"
          helperText="Space-separated scopes (e.g., openid profile email)"
        />
      )}

      {strategy === "waad" && (
        <>
          <TextInput
            source="options.realms"
            label="Tenant ID"
            helperText="Azure AD tenant GUID, 'organizations', or 'common'"
          />
          <TextInput
            source="options.scope"
            label="Scope"
            helperText="Space-separated scopes (e.g., openid profile email)"
          />
        </>
      )}

      {(strategy === "oidc" || strategy === "okta") && (
        <SelectInput
          source="options.token_endpoint_auth_method"
          label="Token Endpoint Auth Method"
          helperText="How client credentials are sent to the token endpoint. Use 'client_secret_post' for providers like JumpCloud that reject HTTP Basic."
          defaultValue="client_secret_basic"
          choices={[
            { id: "client_secret_basic", name: "Client Secret Basic" },
            { id: "client_secret_post", name: "Client Secret Post" },
          ]}
        />
      )}

      {(strategy === "oauth2" ||
        strategy === "oidc" ||
        strategy === "okta") && (
        <>
          <SelectInput
            source="response_type"
            label="Response Type"
            choices={[
              { id: "code", name: "Code" },
              { id: "code id_token", name: "Code ID-token" },
            ]}
          />
          <SelectInput
            source="response_mode"
            label="Response Mode"
            choices={[
              { id: "query", name: "Query" },
              { id: "fragment", name: "Fragment" },
              { id: "web_message", name: "Web Message" },
              { id: "form_post", name: "Form Post" },
            ]}
          />
          <TextInput source="options.scope" label="Scope" />
          <TextInput
            source="options.authorization_endpoint"
            label="Authorization Endpoint"
          />
          <TextInput
            source="options.userinfo_endpoint"
            label="Userinfo Endpoint"
          />
          <TextInput source="options.token_endpoint" label="Token Endpoint" />
          <TextInput source="options.icon_url" label="Icon URL" />
        </>
      )}

      {strategy === Strategy.SMS && (
        <>
          <TextInput source="options.twilio_sid" label="Twilio Account ID" />
          <SecretInput source="options.twilio_token" label="Twilio Token" />
          <TextInput source="options.from" label="From" />
        </>
      )}

      {!isDb && strategy !== Strategy.SMS && (
        <SelectInput
          source="options.set_user_root_attributes"
          label="Set User Root Attributes"
          helperText="Controls when profile data from this connection updates user attributes"
          defaultValue="on_each_login"
          choices={[
            { id: "on_each_login", name: "On Each Login" },
            { id: "on_first_login", name: "On First Login" },
            { id: "never_on_login", name: "Never On Login" },
          ]}
        />
      )}

      {isHrdEligibleStrategy(strategy) && (
        <ArrayInput
          source="options.domain_aliases"
          label="Domain Aliases"
          helperText="Email domains routed to this connection via Home Realm Discovery (e.g. acme.com)"
        >
          <SimpleFormIterator inline>
            <TextInput source="" label="Domain" />
          </SimpleFormIterator>
        </ArrayInput>
      )}

      <BooleanInput
        source="options.disable_signup"
        label="Disable Sign Ups"
        helperText="Prevent new user sign ups from this connection"
      />

      {isDb && (
        <>
          <BooleanInput
            source="options.brute_force_protection"
            label="Brute Force Protection"
          />
          <BooleanInput
            source="options.import_mode"
            label="Import Mode"
            helperText="On unknown passwords, fall back to an upstream auth server using the credentials below. On success the user/password are migrated locally. The upstream client must have the password grant type enabled."
          />
          <ImportModeConfiguration />
        </>
      )}
    </>
  );
}
