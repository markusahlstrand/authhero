import { ListParams } from "@authhero/adapter-interfaces";

/**
 * Options for fetching all resources with pagination.
 */
export interface FetchAllOptions {
  /**
   * The field to use for cursor-based pagination.
   * This field should be unique and sortable (e.g., 'id', 'created_at').
   * @default 'id'
   */
  cursorField?: string;

  /**
   * The sort order for the cursor field.
   * @default 'asc'
   */
  sortOrder?: "asc" | "desc";

  /**
   * Maximum number of items to fetch per page.
   * @default 100
   */
  pageSize?: number;

  /**
   * Maximum total items to fetch (for safety).
   * Set to -1 for unlimited.
   * @default 10000
   */
  maxItems?: number;

  /**
   * Optional filter query (Lucene-style).
   */
  q?: string;
}

/**
 * Fetches all resources from a paginated list endpoint by iterating through pages.
 *
 * Uses cursor-based pagination by filtering on a sortable field (like 'id') to ensure
 * consistent results even if data changes between requests.
 *
 * @param listFn - The list function from the adapter (e.g., adapters.tenants.list)
 * @param itemsKey - The key in the response that contains the array of items (e.g., 'tenants', 'users')
 * @param options - Pagination options
 * @returns Promise resolving to an array of all items
 *
 * @example
 * ```typescript
 * // Fetch all tenants
 * const allTenants = await fetchAll(
 *   (params) => adapters.tenants.list(params),
 *   'tenants'
 * );
 *
 * // Fetch all users for a tenant with custom options
 * const allUsers = await fetchAll(
 *   (params) => adapters.users.list(tenantId, params),
 *   'users',
 *   { cursorField: 'user_id', pageSize: 50 }
 * );
 * ```
 */
export async function fetchAll<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listFn: (params: ListParams) => Promise<any>,
  itemsKey: string,
  options: FetchAllOptions = {},
): Promise<T[]> {
  const {
    cursorField = "id",
    sortOrder = "asc",
    pageSize = 100,
    maxItems = 10000,
    q,
  } = options;

  const allItems: T[] = [];
  let lastCursor: string | undefined;
  let hasMore = true;

  while (hasMore) {
    // Build the query filter
    let query = q || "";

    // Add cursor-based pagination filter if we have a cursor
    if (lastCursor) {
      const operator = sortOrder === "asc" ? ">" : "<";
      const cursorFilter = `${cursorField}:${operator}${lastCursor}`;
      query = query ? `(${query}) AND ${cursorFilter}` : cursorFilter;
    }

    const params: ListParams = {
      per_page: pageSize,
      page: 0, // Always use page 0 since we're doing cursor-based pagination
      sort: {
        sort_by: cursorField,
        sort_order: sortOrder,
      },
      ...(query && { q: query }),
    };

    const response = await listFn(params);
    const items = (response[itemsKey] as T[]) || [];

    if (items.length === 0) {
      hasMore = false;
    } else {
      allItems.push(...items);

      // Get the last item's cursor value for the next iteration
      const lastItem = items[items.length - 1];
      if (lastItem && typeof lastItem === "object") {
        const cursorValue = (lastItem as Record<string, unknown>)[cursorField];

        if (cursorValue !== undefined && cursorValue !== null) {
          lastCursor = String(cursorValue);
        }
      }

      // Check if we got fewer items than requested (last page)
      if (items.length < pageSize) {
        hasMore = false;
      }

      // Safety check to prevent infinite loops
      if (maxItems !== -1 && allItems.length >= maxItems) {
        console.warn(
          `fetchAll: Reached maxItems limit (${maxItems}). There may be more items.`,
        );
        hasMore = false;
      }
    }
  }

  return allItems;
}
