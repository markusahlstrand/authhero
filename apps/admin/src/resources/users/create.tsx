import {
  Create,
  SimpleForm,
  TextInput,
  SelectInput,
  BooleanInput,
} from "@/components/admin";
import { useGetList, useResourceContext } from "ra-core";
import { Strategy } from "@/utils/Strategy";

const USERNAME_PASSWORD_PROVIDER = "auth2";

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
        data.provider =
          connection.strategy === Strategy.USERNAME_PASSWORD
            ? USERNAME_PASSWORD_PROVIDER
            : connection.strategy || "database";
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
