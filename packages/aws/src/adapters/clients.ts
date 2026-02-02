import {
  ClientsAdapter,
  Client,
  ClientInsert,
  ClientWithTenantId,
  Totals,
  ListParams,
  clientSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { clientKeys, legacyClientKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface ClientItem extends DynamoDBBaseItem {
  client_id: string;
  tenant_id: string;
  name: string;
  client_secret?: string;
  description?: string;
  logo_uri?: string;
  app_type?: string;
  token_endpoint_auth_method?: string;
  initiate_login_uri?: string;
  cross_origin_loc?: string;
  custom_login_page?: string;
  custom_login_page_preview?: string;
  form_template?: string;
  organization_usage?: string;
  organization_require_behavior?: string;
  compliance_level?: string;
  par_request_expiry?: number;
  // Boolean fields
  global: boolean;
  is_first_party: boolean;
  oidc_conformant: boolean;
  auth0_conformant: boolean;
  sso?: boolean;
  sso_disabled?: boolean;
  cross_origin_authentication?: boolean;
  custom_login_page_on?: boolean;
  require_pushed_authorization_requests?: boolean;
  require_proof_of_possession?: boolean;
  // JSON string fields
  callbacks?: string;
  allowed_origins?: string;
  web_origins?: string;
  client_aliases?: string;
  allowed_clients?: string;
  connections?: string;
  allowed_logout_urls?: string;
  session_transfer?: string;
  oidc_logout?: string;
  grant_types?: string;
  jwt_configuration?: string;
  signing_keys?: string;
  encryption_key?: string;
  addons?: string;
  client_metadata?: string;
  mobile?: string;
  native_social_login?: string;
  refresh_token?: string;
  default_organization?: string;
  client_authentication_methods?: string;
  signed_request_object?: string;
  token_quota?: string;
}

function toClient(item: ClientItem): Client {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);

  const data = removeNullProperties({
    ...rest,
    callbacks: item.callbacks ? JSON.parse(item.callbacks) : undefined,
    allowed_origins: item.allowed_origins ? JSON.parse(item.allowed_origins) : undefined,
    web_origins: item.web_origins ? JSON.parse(item.web_origins) : undefined,
    client_aliases: item.client_aliases ? JSON.parse(item.client_aliases) : undefined,
    allowed_clients: item.allowed_clients ? JSON.parse(item.allowed_clients) : undefined,
    connections: item.connections ? JSON.parse(item.connections) : undefined,
    allowed_logout_urls: item.allowed_logout_urls ? JSON.parse(item.allowed_logout_urls) : undefined,
    session_transfer: item.session_transfer ? JSON.parse(item.session_transfer) : undefined,
    oidc_logout: item.oidc_logout ? JSON.parse(item.oidc_logout) : undefined,
    grant_types: item.grant_types ? JSON.parse(item.grant_types) : undefined,
    jwt_configuration: item.jwt_configuration ? JSON.parse(item.jwt_configuration) : undefined,
    signing_keys: item.signing_keys ? JSON.parse(item.signing_keys) : undefined,
    encryption_key: item.encryption_key ? JSON.parse(item.encryption_key) : undefined,
    addons: item.addons ? JSON.parse(item.addons) : undefined,
    client_metadata: item.client_metadata ? JSON.parse(item.client_metadata) : undefined,
    mobile: item.mobile ? JSON.parse(item.mobile) : undefined,
    native_social_login: item.native_social_login ? JSON.parse(item.native_social_login) : undefined,
    refresh_token: item.refresh_token ? JSON.parse(item.refresh_token) : undefined,
    default_organization: item.default_organization ? JSON.parse(item.default_organization) : undefined,
    client_authentication_methods: item.client_authentication_methods 
      ? JSON.parse(item.client_authentication_methods)
      : undefined,
    signed_request_object: item.signed_request_object 
      ? JSON.parse(item.signed_request_object) 
      : undefined,
    token_quota: item.token_quota ? JSON.parse(item.token_quota) : undefined,
  });

  return clientSchema.parse(data);
}

function toClientWithTenantId(item: ClientItem): ClientWithTenantId {
  const client = toClient(item);
  return {
    ...client,
    tenant_id: item.tenant_id,
  };
}

export function createClientsAdapter(ctx: DynamoDBContext): ClientsAdapter {
  return {
    async create(_tenantId: string, params: ClientInsert): Promise<Client> {
      const now = new Date().toISOString();

      const item: ClientItem = {
        PK: clientKeys.pk(_tenantId),
        SK: clientKeys.sk(params.client_id),
        entityType: "CLIENT",
        tenant_id: _tenantId,
        client_id: params.client_id,
        name: params.name,
        client_secret: params.client_secret,
        description: params.description,
        logo_uri: params.logo_uri,
        app_type: params.app_type,
        token_endpoint_auth_method: params.token_endpoint_auth_method,
        initiate_login_uri: params.initiate_login_uri,
        cross_origin_loc: params.cross_origin_loc,
        custom_login_page: params.custom_login_page,
        custom_login_page_preview: params.custom_login_page_preview,
        form_template: params.form_template,
        organization_usage: params.organization_usage,
        organization_require_behavior: params.organization_require_behavior,
        compliance_level: params.compliance_level,
        par_request_expiry: params.par_request_expiry,
        global: params.global ?? false,
        is_first_party: params.is_first_party ?? false,
        oidc_conformant: params.oidc_conformant ?? true,
        auth0_conformant: params.auth0_conformant ?? true,
        sso: params.sso,
        sso_disabled: params.sso_disabled,
        cross_origin_authentication: params.cross_origin_authentication,
        custom_login_page_on: params.custom_login_page_on,
        require_pushed_authorization_requests: params.require_pushed_authorization_requests,
        require_proof_of_possession: params.require_proof_of_possession,
        callbacks: params.callbacks ? JSON.stringify(params.callbacks) : undefined,
        allowed_origins: params.allowed_origins ? JSON.stringify(params.allowed_origins) : undefined,
        web_origins: params.web_origins ? JSON.stringify(params.web_origins) : undefined,
        client_aliases: params.client_aliases ? JSON.stringify(params.client_aliases) : undefined,
        allowed_clients: params.allowed_clients ? JSON.stringify(params.allowed_clients) : undefined,
        connections: params.connections ? JSON.stringify(params.connections) : undefined,
        allowed_logout_urls: params.allowed_logout_urls ? JSON.stringify(params.allowed_logout_urls) : undefined,
        session_transfer: params.session_transfer ? JSON.stringify(params.session_transfer) : undefined,
        oidc_logout: params.oidc_logout ? JSON.stringify(params.oidc_logout) : undefined,
        grant_types: params.grant_types ? JSON.stringify(params.grant_types) : undefined,
        jwt_configuration: params.jwt_configuration ? JSON.stringify(params.jwt_configuration) : undefined,
        signing_keys: params.signing_keys ? JSON.stringify(params.signing_keys) : undefined,
        encryption_key: params.encryption_key ? JSON.stringify(params.encryption_key) : undefined,
        addons: params.addons ? JSON.stringify(params.addons) : undefined,
        client_metadata: params.client_metadata ? JSON.stringify(params.client_metadata) : undefined,
        mobile: params.mobile ? JSON.stringify(params.mobile) : undefined,
        native_social_login: params.native_social_login ? JSON.stringify(params.native_social_login) : undefined,
        refresh_token: params.refresh_token ? JSON.stringify(params.refresh_token) : undefined,
        default_organization: params.default_organization ? JSON.stringify(params.default_organization) : undefined,
        client_authentication_methods: params.client_authentication_methods 
          ? JSON.stringify(params.client_authentication_methods) 
          : undefined,
        signed_request_object: params.signed_request_object 
          ? JSON.stringify(params.signed_request_object) 
          : undefined,
        token_quota: params.token_quota ? JSON.stringify(params.token_quota) : undefined,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return toClient(item);
    },

    async get(tenantId: string, clientId: string): Promise<Client | null> {
      const item = await getItem<ClientItem>(
        ctx,
        clientKeys.pk(tenantId),
        clientKeys.sk(clientId),
      );

      if (!item) return null;

      return toClient(item);
    },

    async getByClientId(clientId: string): Promise<ClientWithTenantId | null> {
      // Lookup the client from the legacy clients table which stores
      // a reference by client_id only
      const legacyItem = await getItem<{ tenant_id: string }>(
        ctx,
        legacyClientKeys.pk(),
        legacyClientKeys.sk(clientId),
      );

      if (!legacyItem?.tenant_id) return null;

      // Now fetch the full client from the clients table
      const item = await getItem<ClientItem>(
        ctx,
        clientKeys.pk(legacyItem.tenant_id),
        clientKeys.sk(clientId),
      );

      if (!item) return null;

      return toClientWithTenantId(item);
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<{ clients: Client[]; totals?: Totals }> {
      const result = await queryWithPagination<ClientItem>(
        ctx,
        clientKeys.pk(tenantId),
        params,
        { skPrefix: "CLIENT#" },
      );

      const clients = result.items.map(toClient);

      if (params.include_totals) {
        return {
          clients,
          totals: {
            start: result.start,
            limit: result.limit,
            length: result.length,
          },
        };
      }

      return { clients };
    },

    async update(
      tenantId: string,
      clientId: string,
      client: Partial<Client>,
    ): Promise<boolean> {
      const updates: Record<string, unknown> = {
        ...client,
        updated_at: new Date().toISOString(),
      };
      
      // Serialize arrays and objects
      const jsonFields = [
        "callbacks", "allowed_origins", "web_origins", "client_aliases",
        "allowed_clients", "connections", "allowed_logout_urls", "session_transfer",
        "oidc_logout", "grant_types", "jwt_configuration", "signing_keys",
        "encryption_key", "addons", "client_metadata", "mobile",
        "native_social_login", "refresh_token", "default_organization",
        "client_authentication_methods", "signed_request_object", "token_quota"
      ];
      
      for (const field of jsonFields) {
        if ((client as any)[field] !== undefined) {
          updates[field] = JSON.stringify((client as any)[field]);
        }
      }

      // Remove client_id from updates
      delete updates.client_id;

      return updateItem(
        ctx,
        clientKeys.pk(tenantId),
        clientKeys.sk(clientId),
        updates,
      );
    },

    async remove(tenantId: string, clientId: string): Promise<boolean> {
      return deleteItem(ctx, clientKeys.pk(tenantId), clientKeys.sk(clientId));
    },
  };
}
