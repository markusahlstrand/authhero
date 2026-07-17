/** @jsxImportSource react */
import { Heading, Text } from "@react-email/components";
import { Layout } from "./Layout";

/**
 * Legacy Auth0 template name. Notification that a password was changed (no
 * call-to-action). Kept for Auth0-import compatibility.
 */
export function PasswordReset() {
  return (
    <Layout preview={"{{ password_reset_notification_title }}"}>
      <Heading className="text-lg font-semibold mt-0 mb-3">
        {"{{ password_reset_notification_title }}"}
      </Heading>
      <Text className="mt-0">{"{{ password_reset_notification_intro }}"}</Text>
      <Text className="mt-3">
        {"{{ password_reset_notification_followup }}"}
      </Text>
    </Layout>
  );
}
