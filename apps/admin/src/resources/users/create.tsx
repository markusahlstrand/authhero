import {
  Create,
  SimpleForm,
  TextInput,
  SelectInput,
  BooleanInput,
} from "@/components/admin";
import { useGetList, useResourceContext } from "ra-core";
import { Strategy } from "@/utils/Strategy";

const USERNAME_PASSWORD_PROVIDER = "auth0";

// Legacy tenants persist database connections with the strategy field set
// to a provider literal ("auth2", or "auth0" after migration) instead of
// the canonical Auth0 strategy name. All of them are password connections,
// and none of these literals may be forwarded as the provider — new users
// must never be created with the legacy "auth2" provider.
function isPasswordStrategy(strategy: string): boolean {
  return (
    strategy === Strategy.USERNAME_PASSWORD ||
    strategy === "auth2" ||
    strategy === "auth0"
  );
}

interface ConnectionRecord {
  name: string;
  strategy: string;
}

export function UserCreate() {
  const resource = useResourceContext();
  const { data: connections } = useGetList<ConnectionRecord & { id: string }>(
    "connections",
    {
      pagination: { page: 1, perPage: 100 },
      sort: { field: "name", order: "ASC" },
    },
  );

  const transform = (data: Record<string, unknown>) => {
    if (data.connection && connections) {
      const connection = connections.find((c) => c.name === data.connection);
      if (connection) {
        if (isPasswordStrategy(connection.strategy)) {
          data.provider = USERNAME_PASSWORD_PROVIDER;
          // Store the canonical Auth0 connection name regardless of what the
          // tenant's database connection happens to be named (e.g. "password"),
          // so admin-created users match the connection the login flows use.
          data.connection = Strategy.USERNAME_PASSWORD;
        } else {
          data.provider = connection.strategy || "database";
        }
      }
    }
    return data;
  };

  return (
    <Create resource={resource} transform={transform}>
      <SimpleForm>
        <SelectInput
          source="connection"
          label="Connection"
          choices={
            connections?.map((c) => ({ id: c.name, name: c.name })) ?? []
          }
        />
        <TextInput source="email" type="email" />
        <TextInput source="phone_number" label="Phone number" />
        <TextInput source="password" type="password" />
        <TextInput source="name" />
        <TextInput source="given_name" />
        <TextInput source="family_name" />
        <TextInput source="picture" />
        <BooleanInput source="email_verified" />
        <BooleanInput source="phone_verified" />
      </SimpleForm>
    </Create>
  );
}
