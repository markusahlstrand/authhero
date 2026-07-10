export interface ListParams {
  page?: number;
  per_page?: number;
  include_totals?: boolean;
  q?: string;
  sort?: {
    sort_by: string;
    sort_order: "asc" | "desc";
  };
  // Checkpoint (keyset) pagination, an alternative to page/per_page.
  // `from` is an OPAQUE cursor token — the `next` value returned by the
  // previous response, passed back verbatim. It is not a numeric offset.
  // `take` is the page size. Adapters decode `from` via decodeCursor().
  from?: string;
  take?: number;
  // Optional date range (Unix timestamp in seconds, inclusive)
  from_date?: number;
  to_date?: number;
}
