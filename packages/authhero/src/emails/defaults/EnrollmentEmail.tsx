/** @jsxImportSource react */
import { Heading, Link, Section, Text } from "@react-email/components";
import { Layout } from "./Layout";
import { PrimaryButton } from "./PrimaryButton";

export function EnrollmentEmail() {
  return (
    <Layout preview={"{{ enrollment_email_title }}"}>
      <Heading className="text-lg font-semibold mt-0 mb-3">
        {"{{ enrollment_email_title }}"}
      </Heading>
      <Text className="mt-0">{"{{ enrollment_email_intro }}"}</Text>
      <Section className="text-center my-6">
        <PrimaryButton href={"{{ url }}"}>
          {"{{ enrollment_email_button }}"}
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
