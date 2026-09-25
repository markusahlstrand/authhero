import { Create, SimpleForm } from "@/components/admin";
import { fromProfileCreateValues, type ProfileFormValues } from "./formMapping";
import { ProfileFields } from "./profile-fields";

export function TokenExchangeProfileCreate() {
  return (
    <Create
      redirect="edit"
      transform={(data: ProfileFormValues) => fromProfileCreateValues(data)}
    >
      <SimpleForm
        className="max-w-none"
        defaultValues={{ mode: "jwt", keys_source: "jwks_uri" }}
      >
        <ProfileFields />
      </SimpleForm>
    </Create>
  );
}
