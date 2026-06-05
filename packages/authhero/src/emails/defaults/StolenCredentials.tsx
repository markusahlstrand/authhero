/** @jsxImportSource react */
import { Heading, Link, Section, Text } from "@react-email/components";
import { Layout } from "./Layout";
import { PrimaryButton } from "./PrimaryButton";

export function StolenCredentials() {
  return (
    <Layout preview={"{{ stolen_credentials_title }}"}>
      <Heading className="text-lg font-semibold mt-0 mb-3">
        {"{{ stolen_credentials_title }}"}
      </Heading>
      <Text className="mt-0">{"{{ stolen_credentials_intro }}"}</Text>
      <Text className="mt-3">{"{{ stolen_credentials_action }}"}</Text>
      <Section className="text-center my-6">
        <PrimaryButton href={"{{ url }}"}>
          {"{{ reset_password_email_reset }}"}
        </PrimaryButton>
      </Section>
      <Text className="text-zinc-700 mt-6 mb-1">
        {"{{ link_email_fallback_intro }}"}
      </Text>
      <Text className="break-all m-0 text-[13px]">
        <Link
          href={"{{ url }}"}
          style={{ color: "{{ branding.primary_color }}" }}
        >
          {"{{ url }}"}
        </Link>
      </Text>
    </Layout>
  );
}
