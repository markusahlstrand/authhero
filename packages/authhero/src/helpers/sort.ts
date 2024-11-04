export function parseSort(sort?: string):
  | undefined
  | {
      sort_by: string;
      sort_order: "asc" | "desc";
    } {
  if (!sort) {
    return undefined;
  }

  const [sort_by, orderString] = sort.split(":");
  const sort_order = orderString === "1" ? "asc" : "desc";

  if (!sort_by || !sort_order) {
    return undefined;
  }

  return {
    sort_by,
    sort_order,
  };
}
