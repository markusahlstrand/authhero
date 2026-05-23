import type { EmailTemplateName } from "@authhero/adapter-interfaces";

export const defaultSubjects: Partial<Record<EmailTemplateName, string>> = {
  reset_email: "{{ password_reset_title }}",
  reset_email_by_code: "{{ password_reset_title }}",
  verify_email: "{{ welcome_to_your_account }}",
  verify_email_by_code: "{{ code_email_subject }}",
  welcome_email: "{{ welcome_to_your_account }}",
  user_invitation: "{{ invitation_email_subject }}",
};
