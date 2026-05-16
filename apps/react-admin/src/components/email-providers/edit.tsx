import {
  Edit,
  TextInput,
  TabbedForm,
  BooleanInput,
  SelectInput,
  NumberInput,
  FormDataConsumer,
} from "react-admin";
import { Stack, Alert } from "@mui/material";
import { SecretInput } from "../common/SecretInput";

// Mirrors Auth0's `EmailProviderNameEnum`.
const PROVIDER_CHOICES = [
  { id: "mailgun", name: "Mailgun" },
  { id: "sendgrid", name: "SendGrid" },
  { id: "ses", name: "Amazon SES" },
  { id: "smtp", name: "SMTP" },
  { id: "mandrill", name: "Mandrill" },
  { id: "sparkpost", name: "SparkPost" },
  { id: "ms365", name: "Microsoft 365" },
  { id: "azure_cs", name: "Azure Communication Services" },
];

// Auth0 Mailgun region: "eu" or null (US).
const MAILGUN_REGION_CHOICES = [
  { id: "us", name: "US (default)" },
  { id: "eu", name: "EU" },
];

const SPARKPOST_REGION_CHOICES = [
  { id: "us", name: "US (default)" },
  { id: "eu", name: "EU" },
];

// Whitelist credential keys per provider — any other keys are dropped on save
// so stale fields don't persist when the user switches provider type.
const PROVIDER_CREDENTIAL_KEYS: Record<string, string[]> = {
  mailgun: ["api_key", "domain", "region"],
  sendgrid: ["api_key"],
  ses: ["accessKeyId", "secretAccessKey", "region"],
  smtp: ["smtp_host", "smtp_port", "smtp_user", "smtp_pass"],
  mandrill: ["api_key"],
  sparkpost: ["api_key", "region"],
  ms365: ["tenantId", "clientId", "clientSecret"],
  azure_cs: ["connectionString"],
};

function isFilled(v: unknown): boolean {
  return v !== null && v !== undefined && v !== "";
}

const transform = (data: Record<string, unknown>) => {
  const { id: _id, ...rest } = data;
  const name = typeof rest.name === "string" ? rest.name : "";
  const allowed = PROVIDER_CREDENTIAL_KEYS[name] ?? [];
  const raw = (rest.credentials ?? {}) as Record<string, unknown>;

  const credentials: Record<string, unknown> = {};
  for (const key of allowed) {
    let value = raw[key];
    // Mailgun + SparkPost: "us" in the form means null on the wire.
    if ((name === "mailgun" || name === "sparkpost") && key === "region") {
      if (value === "us" || value === "" || value === undefined) {
        continue;
      }
    }
    if (isFilled(value)) credentials[key] = value;
  }

  return { ...rest, credentials };
};

export function EmailProvidersEdit({ id }: { id?: string } = {}) {
  return (
    <Edit
      transform={transform}
      mutationMode="pessimistic"
      title="Email Provider"
      id={id}
      resource="email-providers"
    >
      <TabbedForm>
        <TabbedForm.Tab label="General">
          <Stack spacing={2} sx={{ maxWidth: 600 }}>
            <SelectInput
              source="name"
              label="Provider"
              choices={PROVIDER_CHOICES}
              fullWidth
              helperText="Only Mailgun has a built-in service in authhero. Other providers require a custom EmailServiceAdapter."
            />
            <BooleanInput
              source="enabled"
              label="Enabled"
              defaultValue={true}
            />
            <TextInput
              source="default_from_address"
              label="Default From Address"
              fullWidth
              helperText="Used when an email is sent without an explicit From address."
            />
          </Stack>
        </TabbedForm.Tab>

        <TabbedForm.Tab label="Credentials">
          <FormDataConsumer>
            {({ formData }) => {
              const name = formData?.name as string | undefined;
              if (!name) {
                return (
                  <Alert severity="info">
                    Pick a provider on the General tab first.
                  </Alert>
                );
              }
              return (
                <Stack spacing={2} sx={{ maxWidth: 600 }}>
                  {name === "mailgun" && (
                    <>
                      <SecretInput
                        source="credentials.api_key"
                        label="API Key"
                        fullWidth
                      />
                      <TextInput
                        source="credentials.domain"
                        label="Domain"
                        fullWidth
                        helperText="The verified Mailgun sending domain, e.g. mg.example.com."
                      />
                      <SelectInput
                        source="credentials.region"
                        label="Region"
                        choices={MAILGUN_REGION_CHOICES}
                        defaultValue="us"
                        format={(v: unknown) =>
                          v === null || v === undefined || v === ""
                            ? "us"
                            : (v as string)
                        }
                      />
                    </>
                  )}

                  {name === "sendgrid" && (
                    <SecretInput
                      source="credentials.api_key"
                      label="API Key"
                      fullWidth
                    />
                  )}

                  {name === "mandrill" && (
                    <SecretInput
                      source="credentials.api_key"
                      label="API Key"
                      fullWidth
                    />
                  )}

                  {name === "sparkpost" && (
                    <>
                      <SecretInput
                        source="credentials.api_key"
                        label="API Key"
                        fullWidth
                      />
                      <SelectInput
                        source="credentials.region"
                        label="Region"
                        choices={SPARKPOST_REGION_CHOICES}
                        defaultValue="us"
                        format={(v: unknown) =>
                          v === null || v === undefined || v === ""
                            ? "us"
                            : (v as string)
                        }
                      />
                    </>
                  )}

                  {name === "ses" && (
                    <>
                      <TextInput
                        source="credentials.accessKeyId"
                        label="Access Key ID"
                        fullWidth
                      />
                      <SecretInput
                        source="credentials.secretAccessKey"
                        label="Secret Access Key"
                        fullWidth
                      />
                      <TextInput
                        source="credentials.region"
                        label="AWS Region"
                        fullWidth
                        helperText="e.g. us-east-1"
                      />
                    </>
                  )}

                  {name === "smtp" && (
                    <>
                      <TextInput
                        source="credentials.smtp_host"
                        label="SMTP Host"
                        fullWidth
                      />
                      <NumberInput
                        source="credentials.smtp_port"
                        label="SMTP Port"
                      />
                      <TextInput
                        source="credentials.smtp_user"
                        label="SMTP Username"
                        fullWidth
                      />
                      <SecretInput
                        source="credentials.smtp_pass"
                        label="SMTP Password"
                        fullWidth
                      />
                    </>
                  )}

                  {name === "ms365" && (
                    <>
                      <TextInput
                        source="credentials.tenantId"
                        label="Microsoft 365 Tenant ID"
                        fullWidth
                      />
                      <TextInput
                        source="credentials.clientId"
                        label="Client ID"
                        fullWidth
                      />
                      <SecretInput
                        source="credentials.clientSecret"
                        label="Client Secret"
                        fullWidth
                      />
                    </>
                  )}

                  {name === "azure_cs" && (
                    <SecretInput
                      source="credentials.connectionString"
                      label="Connection String"
                      fullWidth
                    />
                  )}
                </Stack>
              );
            }}
          </FormDataConsumer>
        </TabbedForm.Tab>
      </TabbedForm>
    </Edit>
  );
}
