/** @jsxImportSource react */
import { Heading, Text } from "@react-email/components";
import { Layout } from "./Layout";

export function ResetEmailByCode() {
  return (
    <Layout preview={"{{ password_reset_title }}"}>
      <Heading className="text-lg font-semibold mt-0 mb-3">
        {"{{ password_reset_title }}"}
      </Heading>
      <Text className="mt-0">{"{{ reset_password_email_enter_code }}"}</Text>
      <Text className="text-3xl font-bold text-center my-6 tracking-[0.25em]">
        {"{{ code }}"}
      </Text>
      <Text className="text-xs text-zinc-500 text-center m-0">
        {"{{ code_valid_30_minutes }}"}
      </Text>
    </Layout>
  );
}
