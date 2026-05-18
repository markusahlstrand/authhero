import { BooleanInput, SelectInput } from "@/components/admin";
import { useWatch } from "react-hook-form";
import { Separator } from "@/components/ui/separator";

function PasskeyOptions() {
  const passkeyEnabled = useWatch({
    name: "options.authentication_methods.passkey.enabled",
  });
  if (!passkeyEnabled) return null;
  return (
    <>
      <SelectInput
        source="options.passkey_options.challenge_ui"
        label="Challenge UI"
        helperText="How browsers present the passkey challenge"
        defaultValue="both"
        choices={[
          { id: "both", name: "Both" },
          { id: "autofill", name: "Autofill" },
          { id: "button", name: "Button" },
        ]}
      />
      <BooleanInput
        source="options.passkey_options.progressive_enrollment_enabled"
        label="Progressive Enrollment"
        helperText="Prompt existing users to enroll a passkey on login"
      />
      <BooleanInput
        source="options.passkey_options.local_enrollment_enabled"
        label="Local Enrollment"
        helperText="Allow users to enroll a passkey from their profile"
      />
    </>
  );
}

export function AuthenticationMethodsTab() {
  return (
    <>
      <h3 className="text-base font-semibold mt-2 mb-2">Password</h3>
      <BooleanInput
        source="options.authentication_methods.password.enabled"
        label="Enable Password Authentication"
        defaultValue={true}
      />

      <Separator className="my-4" />

      <h3 className="text-base font-semibold mt-2 mb-2">Passkey</h3>
      <BooleanInput
        source="options.authentication_methods.passkey.enabled"
        label="Enable Passkey Authentication"
      />
      <PasskeyOptions />
    </>
  );
}
