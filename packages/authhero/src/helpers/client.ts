import { HTTPException } from "hono/http-exception";
import { Client, connectionSchema } from "@authhero/adapter-interfaces";
import { Bindings } from "../types";

export async function getClientWithDefaults(
  env: Bindings,
  clientId: string,
): Promise<Client> {
  const client = await env.data.clients.get(clientId);
  if (!client) {
    throw new HTTPException(403, { message: "Client not found" });
  }

  const defaultClient = env.DEFAULT_CLIENT_ID
    ? await env.data.clients.get(env.DEFAULT_CLIENT_ID)
    : undefined;

  // TODO: This is not really correct. The connections are not part of a client, but it will be fixed in a later version
  const clientConnections = await env.data.connections.list(client.tenant.id, {
    include_totals: false,
    page: 0,
    per_page: 100,
  });

  const defaultConnections = env.DEFAULT_TENANT_ID
    ? await env.data.connections.list(env.DEFAULT_TENANT_ID, {
        include_totals: false,
        page: 0,
        per_page: 100,
      })
    : { connections: [] };

  const connections = clientConnections.connections
    .map((connection) => {
      // @ts-expect-error TODO: This must be wrong in the kysely adapter
      connection.options = JSON.parse(connection.options);

      const defaultConnection = defaultConnections.connections?.find(
        (c) => c.name === connection.name,
      );

      if (!defaultConnection?.options) {
        return connection;
      }

      const mergedConnection = connectionSchema.parse({
        ...(defaultConnection || {}),
        ...connection,
        options: {
          // @ts-expect-error TODO: This must be wrong in the kysely adapter
          ...(JSON.parse(defaultConnection.options) || {}),
          ...connection.options,
        },
      });

      return mergedConnection;
    })
    .filter((c) => c);

  return {
    ...client,
    web_origins: [
      ...(defaultClient?.web_origins || []),
      ...(client.web_origins || []),
      `${env.ISSUER}u/login`,
    ],
    allowed_logout_urls: [
      ...(defaultClient?.allowed_logout_urls || []),
      ...(client.allowed_logout_urls || []),
      env.ISSUER,
    ],
    callbacks: [
      ...(defaultClient?.callbacks || []),
      ...(client.callbacks || []),
      `${env.ISSUER}u/info`,
    ],
    connections,
    domains: [...(client.domains || []), ...(defaultClient?.domains || [])],
    tenant: {
      ...(defaultClient?.tenant || {}),
      ...client.tenant,
    },
  };
}
