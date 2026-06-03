/** @jsxImportSource react */
import { Heading, Link, Section, Text } from "@react-email/components";
import { Layout } from "./Layout";
import { PrimaryButton } from "./PrimaryButton";

export function ResetEmail() {
  return (
    <Layout preview={"{{ password_reset_title }}"}>
      <Heading className="text-lg font-semibold mt-0 mb-3">
        {"{{ password_reset_title }}"}
      </Heading>
      <Text className="mt-0">{"{{ reset_password_email_click_to_reset }}"}</Text>
      <Section className="text-center my-6">
        <PrimaryButton href={"{{ url }}"}>
          {"{{ reset_password_email_reset }}"}
        </PrimaryButton>
      </Section>
      <Text className="text-zinc-700 mt-6 mb-1">
        {"{{ link_email_fallback_intro }}"}
      </Text>
      <Text className="break-all m-0 text-[13px]">
        <Link href={"{{ url }}"}>{"{{ url }}"}</Link>
      </Text>
    </Layout>
  );
}
