/** @jsxImportSource react */
import { Heading, Link, Section, Text } from "@react-email/components";
import { Layout } from "./Layout";
import { PrimaryButton } from "./PrimaryButton";

export function WelcomeEmail() {
  return (
    <Layout preview={"{{ welcome_to_your_account }}"}>
      <Heading className="text-lg font-semibold mt-0 mb-3">
        {"{{ welcome_to_your_account }}"}
      </Heading>
      <Text className="mt-0">{"{{ welcome_body }}"}</Text>
      {`{% if url %}`}
      <Section className="text-center my-6">
        <PrimaryButton href={"{{ url }}"}>{"{{ welcome_cta }}"}</PrimaryButton>
      </Section>
      <Text className="text-zinc-700 mt-6 mb-1">
        {"{{ link_email_fallback_intro }}"}
      </Text>
      <Text className="break-all m-0 text-[13px]">
        <Link href={"{{ url }}"}>{"{{ url }}"}</Link>
      </Text>
      {`{% endif %}`}
    </Layout>
  );
}
