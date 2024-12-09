import { HTTPException } from "hono/http-exception";
import { Client, connectionSchema } from "authhero";
import { Bindings } from "../types";

export async function getClient(
  env: Bindings,
  clientId: string,
): Promise<Client> {
  const client = await env.data.clients.get(clientId);
  if (!client) {
    throw new HTTPException(403, { message: "Client not found" });
  }

  // Temporarily assume that this is the default client.
  const defaultClient = await env.data.clients.get("DEFAULT_CLIENT");

  const connections = defaultClient
    ? client.connections
        .map((connection) => {
          const defaultConnection = defaultClient?.connections?.find(
            (c) => c.name === connection.name,
          );

          const mergedConnection = connectionSchema.parse({
            ...defaultConnection,
            ...connection,
            options: {
              ...defaultConnection?.options,
              ...connection.options,
            },
          });

          return mergedConnection;
        })
        .filter((c) => c)
    : client.connections;

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
