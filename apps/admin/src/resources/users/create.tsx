import {
  Create,
  SimpleForm,
  TextInput,
  SelectInput,
  BooleanInput,
} from "@/components/admin";
import { required, useGetList, useResourceContext } from "ra-core";
import { useWatch } from "react-hook-form";
import type { Connection } from "@authhero/adapter-interfaces";
import { getConnectionIdentifierConfig } from "@authhero/adapter-interfaces";
import { Strategy, isDatabaseConnectionStrategy } from "@/utils/Strategy";

const USERNAME_PASSWORD_PROVIDER = "auth0";

// Users can only be created directly on database and passwordless
// connections; social and enterprise users are created by logging in at
// the upstream provider.
type ConnectionKind = "database" | "email" | "sms";

function getConnectionKind(
  connection: Pick<Connection, "strategy"> | undefined,
): ConnectionKind | undefined {
  if (!connection) return undefined;
  if (isDatabaseConnectionStrategy(connection.strategy)) return "database";
  if (connection.strategy === Strategy.EMAIL) return "email";
  if (connection.strategy === Strategy.SMS) return "sms";
  return undefined;
}

function ConnectionUserFields({ connections }: { connections: Connection[] }) {
  const connectionName = useWatch({ name: "connection" });
  const connection = connections.find((c) => c.name === connectionName);
  const kind = getConnectionKind(connection);

  if (!kind) {
    return null;
  }

  if (kind === "sms") {
    return (
      <>
        <TextInput
          source="phone_number"
          label="Phone number"
          validate={[required()]}
        />
        <BooleanInput source="phone_verified" />
      </>
    );
  }

  const { emailIdentifierActive, usernameIdentifierActive } =
    getConnectionIdentifierConfig(connection);

  return (
    <>
      <TextInput
        source="email"
        type="email"
        validate={emailIdentifierActive ? [required()] : undefined}
      />
      {kind === "database" && usernameIdentifierActive && (
        <TextInput source="username" validate={[required()]} />
      )}
      {kind === "database" && (
        <TextInput source="password" type="password" validate={[required()]} />
      )}
      <BooleanInput source="email_verified" />
    </>
  );
}

export function UserCreate() {
  const resource = useResourceContext();
  const { data: connections, isPending } = useGetList<
    Connection & { id: string }
  >("connections", {
    pagination: { page: 1, perPage: 100 },
    sort: { field: "name", order: "ASC" },
  });

  const creatableConnections = (connections ?? []).filter((c) =>
    getConnectionKind(c),
  );

  const transform = (data: Record<string, unknown>) => {
    const connection = creatableConnections.find(
      (c) => c.name === data.connection,
    );
    const kind = getConnectionKind(connection);
    const result = { ...data };

    // The form keeps values from fields that were unmounted when the user
    // switched connection; drop everything the selected connection type
    // doesn't use.
    if (kind === "sms") {
      delete result.email;
      delete result.email_verified;
    } else {
      delete result.phone_number;
      delete result.phone_verified;
    }
    if (kind !== "database") {
      delete result.password;
      delete result.username;
    }
    if (!result.username) {
      delete result.username;
    }

    if (connection) {
      if (kind === "database") {
        result.provider = USERNAME_PASSWORD_PROVIDER;
        // Store the canonical Auth0 connection name regardless of what the
        // tenant's database connection happens to be named (e.g. "password"),
        // so admin-created users match the connection the login flows use.
        result.connection = Strategy.USERNAME_PASSWORD;
      } else {
        result.provider = connection.strategy || "database";
      }
    }
    return result;
  };

  if (isPending) {
    return null;
  }

  const defaultConnection =
    creatableConnections.find((c) => getConnectionKind(c) === "database") ??
    creatableConnections[0];

  return (
    <Create resource={resource} transform={transform}>
      <SimpleForm defaultValues={{ connection: defaultConnection?.name }}>
        <SelectInput
          source="connection"
          label="Connection"
          validate={[required()]}
          choices={creatableConnections.map((c) => ({
            id: c.name,
            name: c.name,
          }))}
        />
        <ConnectionUserFields connections={creatableConnections} />
      </SimpleForm>
    </Create>
  );
}
