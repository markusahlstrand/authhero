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
        if (connection.strategy === Strategy.USERNAME_PASSWORD) {
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
