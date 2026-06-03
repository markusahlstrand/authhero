/** @jsxImportSource react */
import { Heading, Text } from "@react-email/components";
import { Layout } from "./Layout";

export function VerifyEmailByCode() {
  return (
    <Layout preview={"{{ welcome_to_your_account }}"}>
      <Heading className="text-lg font-semibold mt-0 mb-3">
        {"{{ welcome_to_your_account }}"}
      </Heading>
      <Text className="mt-0">{"{{ link_email_click_to_login }}"}</Text>
      <Text className="text-3xl font-bold text-center my-6 tracking-[0.25em]">
        {"{{ code }}"}
      </Text>
      <Text className="text-xs text-zinc-500 text-center m-0">
        {"{{ code_valid_30_minutes }}"}
      </Text>
    </Layout>
  );
}
