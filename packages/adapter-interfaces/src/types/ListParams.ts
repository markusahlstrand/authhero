export interface ListParams {
  page?: number;
  per_page?: number;
  include_totals?: boolean;
  q?: string;
  sort?: {
    sort_by: string;
    sort_order: "asc" | "desc";
  };
  // Checkpoint pagination (alternative to page/per_page)
  from?: string;
  take?: number;
  // Optional date range (Unix timestamp in seconds, inclusive)
  from_date?: number;
  to_date?: number;
}
