import { JSONHTTPException } from "../errors/json-http-exception";
import {
  LegacyClient,
  connectionOptionsSchema,
  connectionSchema,
} from "@authhero/adapter-interfaces";
import { Bindings } from "../types";
import { getUniversalLoginUrl } from "../variables";

export async function getClientWithDefaults(
  env: Bindings,
  clientId: string,
): Promise<LegacyClient> {
  const client = await env.data.legacyClients.get(clientId);
  if (!client) {
    throw new JSONHTTPException(403, { message: "Client not found" });
  }

  // Check if we have default tenant/client configuration for backward compatibility
  // If we do, apply the old fallback logic for cases where main tenant adapter isn't used
  let processedClient = client;

  if (env.DEFAULT_CLIENT_ID || env.DEFAULT_TENANT_ID) {
    const defaultClient = env.DEFAULT_CLIENT_ID
      ? await env.data.legacyClients.get(env.DEFAULT_CLIENT_ID)
      : undefined;

    // TODO: This is not really correct. The connections are not part of a client, but it will be fixed in a later version
    const clientConnections = await env.data.connections.list(client.tenant.id);

    const defaultConnections = env.DEFAULT_TENANT_ID
      ? await env.data.connections.list(env.DEFAULT_TENANT_ID)
      : { connections: [] };

    const connections = clientConnections.connections
      .map((connection) => {
        const defaultConnection = defaultConnections.connections?.find(
          (c) => c.name === connection.name,
        );

        if (!defaultConnection?.options) {
          return connection;
        }

        const mergedConnection = connectionSchema.parse({
          ...(defaultConnection || {}),
          ...connection,
        });

        // Add the passthrough to allow extra options
        mergedConnection.options = connectionOptionsSchema.passthrough().parse({
          ...(defaultConnection.options || {}),
          ...connection.options,
        });

        return mergedConnection;
      })
      .filter((c) => c);

    processedClient = {
      ...client,
      web_origins: [
        ...(defaultClient?.web_origins || []),
        ...(client.web_origins || []),
      ],
      allowed_logout_urls: [
        ...(defaultClient?.allowed_logout_urls || []),
        ...(client.allowed_logout_urls || []),
      ],
      callbacks: [
        ...(defaultClient?.callbacks || []),
        ...(client.callbacks || []),
      ],
      connections,
      tenant: {
        ...(defaultClient?.tenant || {}),
        ...client.tenant,
      },
    };
  }

  // Always add universal login URLs that are required
  return {
    ...processedClient,
    web_origins: [
      ...(processedClient.web_origins || []),
      `${getUniversalLoginUrl(env)}login`,
    ],
    allowed_logout_urls: [
      ...(processedClient.allowed_logout_urls || []),
      env.ISSUER,
    ],
    callbacks: [
      ...(processedClient.callbacks || []),
      `${getUniversalLoginUrl(env)}info`,
    ],
  };
}
