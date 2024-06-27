import querystring from "query-string";
import { fetchUtils, DataProvider } from "ra-core";
import { UpdateParams } from "react-admin";

function removeExtraFields(params: UpdateParams) {
  // delete params.data?.id; // this is required for patch... but not for put?
  delete params.data?.tenant_id;
  delete params.data?.updated_at;
  delete params.data?.created_at;
  delete params.data?.identities;

  // hmmmmm, this is an issue we have here with mismatching structure?
  // seems like we need to modify our endpoints to accept connections.
  // TBD with Markus
  delete params.data?.connections;

  // actually Auth0 does not require this for patching. seems dangerous not to rely on an auto-id
  // as may get rejected for having the same id
  delete params.data?.id;
  // for user we don't want to include this
  delete params.data?.user_id;

  // extra user fields
  delete params.data?.last_login;
  delete params.data?.provider;

  // Remove empty properties
  Object.keys(params.data).forEach((key) => {
    if (params.data[key] === undefined) {
      delete params.data[key];
    }
  });

  return params;
}

function getIdKeyFromResource(resource: string) {
  switch (resource) {
    case "connections":
      return "connnection_id";
    case "domains":
      return "domain_id";
    case "users":
      return "user_id";
    case "logs":
      return "log_id";
    case "tenants":
      return "tenant_id";
    case "applications":
      return "application_id";
    default:
      throw new Error(`unknown resource ${resource}`);
  }
}

/**
 * Maps react-admin queries to the auth0 mamagement api
 */
export default (
  apiUrl: string,
  httpClient = fetchUtils.fetchJson,
  tenantId?: string,
): DataProvider => ({
  getList: async (resource, params) => {
    const { page, perPage } = params.pagination;
    const { field, order } = params.sort;

    const query = {
      include_totals: true,
      page: page - 1,
      per_page: perPage,
      sort: `${field}:${order === "DESC" ? "-1" : "1"}`,
      q: params.filter.q,
    };
    const url = `${apiUrl}/api/v2/${resource}?${querystring.stringify(query)}`;

    const headers = new Headers();

    if (tenantId) {
      headers.set("tenant-id", tenantId);
    }

    const res = await httpClient(url, { headers });

    return {
      data: res.json[resource].map((item: any) => ({
        id: item[getIdKeyFromResource(resource)],
        ...item,
      })),
      total: res.json.length,
    };
  },

  getOne: (resource, params) => {
    const headers = new Headers();

    if (tenantId) {
      headers.set("tenant-id", tenantId);
    }

    return httpClient(`${apiUrl}/api/v2/${resource}/${params.id}`, {
      headers,
    }).then(({ json }) => ({
      data: {
        id: json[getIdKeyFromResource(resource)],
        ...json,
      },
    }));
  },

  getMany: (resource, params) => {
    const query = `id:(${params.ids.join(" ")})})`;

    const url = `${apiUrl}/api/v2/${resource}?q=${query}`;
    return httpClient(url).then(({ json }) => ({
      data: {
        id: json[getIdKeyFromResource(resource)],
        ...json,
      },
    }));
  },

  getManyReference: async (resource, params) => {
    const { page, perPage } = params.pagination;
    const { field, order } = params.sort;

    if (resource !== "logs") {
      return Promise.reject(
        "not supporting getManyReference for anything but resource logs",
      );
    }

    const query = {
      include_totals: true,
      page: page - 1,
      per_page: perPage,
      sort: `${field}:${order === "DESC" ? "-1" : "1"}`,
      q: `user_id:${params.id}`,
    };

    const headers = new Headers();

    if (tenantId) {
      headers.set("tenant-id", tenantId);
    }

    const url = `${apiUrl}/api/v2/${resource}?${querystring.stringify(query)}`;

    const res = await httpClient(url, { headers });

    return {
      data: res.json.logs.map((item: any) => ({
        id: item[getIdKeyFromResource(resource)],
        ...item,
      })),
      total: res.json.length,
    };
  },

  update: (resource, params) => {
    const headers = new Headers();

    if (tenantId) {
      headers.set("tenant-id", tenantId);
    }

    const cleanParams = removeExtraFields(params);

    return httpClient(`${apiUrl}/api/v2/${resource}/${params.id}`, {
      headers,
      method: "PATCH",
      body: JSON.stringify(cleanParams.data),
    }).then(({ json }) => ({ data: json }));
  },

  updateMany: () => Promise.reject("not supporting updateMany"),

  create: async (resource, params) => {
    const headers = new Headers();

    if (tenantId) {
      headers.set("tenant-id", tenantId);
    }

    const res = await httpClient(`${apiUrl}/api/v2/${resource}`, {
      method: "POST",
      body: JSON.stringify(params.data),
      headers,
    });

    const data = {
      ...res.json,
      id: res.json.id,
    };

    return {
      data,
    };
  },

  delete: async (resource, params) => {
    const headers = new Headers({
      "Content-Type": "text/plain",
    });

    if (tenantId) {
      headers.set("tenant-id", tenantId);
    }

    const res = await httpClient(`${apiUrl}/api/v2/${resource}/${params.id}`, {
      method: "DELETE",
      headers,
    });

    return {
      data: res.json,
    };
  },
  deleteMany: () => Promise.reject("not supporting updateMany"),
});
