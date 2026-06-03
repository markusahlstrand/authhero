/** @jsxImportSource react */
import { Heading, Link, Section, Text } from "@react-email/components";
import { Layout } from "./Layout";
import { PrimaryButton } from "./PrimaryButton";

export function VerifyEmail() {
  return (
    <Layout preview={"{{ welcome_to_your_account }}"}>
      <Heading className="text-lg font-semibold mt-0 mb-3">
        {"{{ welcome_to_your_account }}"}
      </Heading>
      <Text className="mt-0">{"{{ link_email_click_to_login }}"}</Text>
      <Section className="text-center my-6">
        <PrimaryButton href={"{{ url }}"}>
          {"{{ link_email_login }}"}
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
      {`{% if code %}`}
      <Text className="text-center text-zinc-500 mt-6 mb-0">
        {"{{ link_email_or_enter_code }}"}
      </Text>
      <Text className="text-2xl font-bold text-center my-2 tracking-[0.25em]">
        {"{{ code }}"}
      </Text>
      <Text className="text-xs text-zinc-500 text-center m-0">
        {"{{ code_valid_30_minutes }}"}
      </Text>
      {`{% endif %}`}
    </Layout>
  );
}
