/** @jsxImportSource react */
import { Heading, Link, Section, Text } from "@react-email/components";
import { Layout } from "./Layout";
import { PrimaryButton } from "./PrimaryButton";

export function UserInvitation() {
  return (
    <Layout preview={"{{ invitation_email_subject }}"}>
      <Heading className="text-lg font-semibold mt-0 mb-3">
        {"{{ invitation_email_subject }}"}
      </Heading>
      <Text className="mt-0">{"{{ invitation_email_intro }}"}</Text>
      <Text>{"{{ invitation_email_click_to_accept }}"}</Text>
      <Section className="text-center my-6">
        <PrimaryButton href={"{{ url }}"}>
          {"{{ invitation_email_accept_button }}"}
        </PrimaryButton>
      </Section>
      <Text className="text-zinc-700 mt-6 mb-1">
        {"{{ link_email_fallback_intro }}"}
      </Text>
      <Text className="break-all m-0 text-[13px]">
        <Link href={"{{ url }}"}>{"{{ url }}"}</Link>
      </Text>
      <Text className="text-xs text-zinc-500 text-center mt-6 mb-0">
        {"{{ invitation_expires_in }}"}
      </Text>
    </Layout>
  );
}
