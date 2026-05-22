/** @jsxImportSource react */
import { Heading, Section, Text } from "@react-email/components";
import { Layout } from "./Layout";
import { PrimaryButton } from "./PrimaryButton";

export function UserInvitation() {
  return (
    <Layout preview={"{{ invitation_email_subject }}"}>
      <Heading className="text-xl font-semibold mb-2">
        {"{{ invitation_email_subject }}"}
      </Heading>
      <Text>{"{{ invitation_email_intro }}"}</Text>
      <Text>{"{{ invitation_email_click_to_accept }}"}</Text>
      <Section className="text-center my-4">
        <PrimaryButton href={"{{ url }}"}>
          {"{{ invitation_email_accept_button }}"}
        </PrimaryButton>
      </Section>
      <Text className="text-xs text-zinc-500 text-center">
        {"{{ invitation_expires_in }}"}
      </Text>
    </Layout>
  );
}
