import {
  CreateButton,
  ExportButton,
  FilterButton,
  SelectColumnsButton,
  TopToolbar,
  useFilterContext,
} from "react-admin";

interface PostListActionsProps {
  create?: boolean;
  selectColumns?: boolean;
}

export function PostListActions({
  create = true,
  selectColumns = false,
}: PostListActionsProps) {
  const filters = useFilterContext();
  const hasFilters = Array.isArray(filters) && filters.length > 0;

  return (
    <TopToolbar>
      {hasFilters && <FilterButton />}
      {selectColumns && <SelectColumnsButton />}
      {create && <CreateButton />}
      <ExportButton />
    </TopToolbar>
  );
}
