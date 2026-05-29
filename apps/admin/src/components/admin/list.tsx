import { Breadcrumb, BreadcrumbPage } from "@/components/admin/breadcrumb";
import type { ListBaseProps, ListControllerResult, RaRecord } from "ra-core";
import {
  FilterContext,
  FilterLiveForm,
  ListBase,
  useGetResourceLabel,
  useResourceContext,
  useResourceDefinition,
  useTranslate,
} from "ra-core";
import type { FormHTMLAttributes, ReactElement, ReactNode } from "react";
import { isValidElement } from "react";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ColumnsButton } from "@/components/admin/columns-button";
import { CreateButton } from "@/components/admin/create-button";
import { ExportButton } from "@/components/admin/export-button";
import { ListPagination } from "@/components/admin/list-pagination";
import { FilterButton, FilterForm } from "@/components/admin/filter-form";
import { SearchInput } from "@/components/admin/search-input";

/**
 * A complete list page with breadcrumb, title, filters, and pagination.
 *
 * It fetches a list of records from the data provider (via ra-core hooks),
 * puts them in a ListContext, renders a default layout (breadcrumb, title,
 * action buttons, inline filters, pagination), then renders its children
 * (usually a <DataTable>).
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/list/ List documentation}
 *
 * @example
 * import { DataTable, List } from "@/components/admin";
 *
 * export const UserList = () => (
 *   <List>
 *     <DataTable>
 *       <DataTable.Col source="id" />
 *       <DataTable.Col source="name" />
 *       <DataTable.Col source="username" />
 *       <DataTable.Col source="email" />
 *       <DataTable.Col source="address.street" />
 *       <DataTable.Col source="phone" />
 *       <DataTable.Col source="website" />
 *       <DataTable.Col source="company.name" />
 *     </DataTable>
 *   </List>
 * );
 */
export const List = <RecordType extends RaRecord = RaRecord>(
  props: ListProps<RecordType>,
) => {
  const {
    debounce,
    disableAuthentication,
    disableSyncWithLocation,
    exporter,
    filter,
    filterDefaultValues,
    loading,
    perPage,
    queryOptions,
    resource,
    sort,
    storeKey,
    ...rest
  } = props;

  return (
    <ListBase<RecordType>
      debounce={debounce}
      disableAuthentication={disableAuthentication}
      disableSyncWithLocation={disableSyncWithLocation}
      exporter={exporter}
      filter={filter}
      filterDefaultValues={filterDefaultValues}
      loading={loading}
      perPage={perPage}
      queryOptions={queryOptions}
      resource={resource}
      sort={sort}
      storeKey={storeKey}
    >
      <ListView<RecordType> {...rest} />
    </ListBase>
  );
};

export interface ListProps<RecordType extends RaRecord = RaRecord>
  extends ListBaseProps<RecordType>, ListViewProps<RecordType> {}

/**
 * The view component for List pages with layout and UI.
 *
 * @internal
 */
export const ListView = <RecordType extends RaRecord = RaRecord>(
  props: ListViewProps<RecordType>,
) => {
  const {
    disableBreadcrumb,
    disableSearch,
    disableColumns,
    filters,
    pagination = defaultPagination,
    searchPlaceholder,
    searchSource = "q",
    title,
    children,
    actions,
  } = props;
  const translate = useTranslate();
  const resource = useResourceContext();
  if (!resource) {
    throw new Error(
      "The ListView component must be used within a ResourceContextProvider",
    );
  }
  const getResourceLabel = useGetResourceLabel();
  const resourceLabel = getResourceLabel(resource, 2);
  const finalTitle =
    title !== undefined
      ? title
      : translate("ra.page.list", {
          name: resourceLabel,
        });
  const { hasCreate } = useResourceDefinition({ resource });

  return (
    <>
      {!disableBreadcrumb && (
        <Breadcrumb>
          <BreadcrumbPage>{resourceLabel}</BreadcrumbPage>
        </Breadcrumb>
      )}

      <FilterContext.Provider value={filters}>
        <div className="flex justify-between items-start flex-wrap gap-2 my-2">
          <h2 className="text-2xl font-bold tracking-tight mb-2">
            {finalTitle}
          </h2>
          {actions ?? (
            <div className="flex items-center gap-2">
              {hasCreate ? <CreateButton /> : null}
              <ExportButton />
            </div>
          )}
        </div>
        <ListToolbar
          disableSearch={disableSearch}
          disableColumns={disableColumns}
          filters={filters}
          searchPlaceholder={searchPlaceholder}
          searchSource={searchSource}
        />
        <FilterForm searchSource={disableSearch ? undefined : searchSource} />

        <div className={cn("my-2", props.className)}>{children}</div>
        {pagination}
      </FilterContext.Provider>
    </>
  );
};

const defaultPagination = <ListPagination />;

const ListToolbar = ({
  disableSearch,
  disableColumns,
  filters,
  searchPlaceholder,
  searchSource = "q",
}: {
  disableSearch?: boolean;
  disableColumns?: boolean;
  filters?: ReactNode[];
  searchPlaceholder?: string;
  searchSource?: string;
}) => {
  const togglableFilters = (filters ?? []).filter(
    (filter) =>
      isValidElement(filter) &&
      !(filter.props as { alwaysOn?: boolean }).alwaysOn &&
      (filter.props as { source?: string }).source !== searchSource,
  );
  const hasToggleableFilters = togglableFilters.length > 0;

  if (disableSearch && !hasToggleableFilters && disableColumns) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 my-2">
      {!disableSearch && (
        <div className="flex w-full max-w-sm">
          <FilterLiveForm formComponent={SearchFormComponent}>
            <SearchInput
              source={searchSource}
              placeholder={searchPlaceholder}
              className="flex-grow"
            />
          </FilterLiveForm>
        </div>
      )}
      <div className="flex items-center gap-2 ml-auto">
        {hasToggleableFilters ? <FilterButton /> : <AddFilterPlaceholder />}
        {!disableColumns ? <ColumnsButton /> : null}
      </div>
    </div>
  );
};

const SearchFormComponent = (props: FormHTMLAttributes<HTMLFormElement>) => (
  <form {...props} className="flex w-full" />
);

const AddFilterPlaceholder = () => {
  const translate = useTranslate();
  return (
    <Button
      type="button"
      variant="outline"
      disabled
      className="cursor-not-allowed opacity-60"
      title={translate("ra.message.no_filters", {
        _: "No filters configured",
      })}
    >
      <Filter className="h-4 w-4" />
      {translate("ra.action.add_filter")}
    </Button>
  );
};

export const Empty = () => {
  const translate = useTranslate();
  const resource = useResourceContext();
  const getResourceLabel = useGetResourceLabel();
  const { hasCreate } = useResourceDefinition({ resource });
  if (!resource) {
    return null;
  }
  const resourceName = translate(`resources.${resource}.forcedCaseName`, {
    smart_count: 0,
    _: resource ? getResourceLabel(resource, 0) : undefined,
  });
  const emptyMessage = translate("ra.page.empty", { name: resourceName });
  const inviteMessage = translate("ra.page.invite");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
      <h2 className="text-2xl font-semibold">
        {translate(`resources.${resource}.empty`, {
          _: emptyMessage,
        })}
      </h2>
      {hasCreate ? (
        <>
          <p className="text-muted-foreground">
            {translate(`resources.${resource}.invite`, {
              _: inviteMessage,
            })}
          </p>
          <CreateButton />
        </>
      ) : null}
    </div>
  );
};

export interface ListViewProps<RecordType extends RaRecord = RaRecord> {
  children?: ReactNode;
  disableBreadcrumb?: boolean;
  disableSearch?: boolean;
  disableColumns?: boolean;
  render?: (props: ListControllerResult<RecordType, Error>) => ReactNode;
  actions?: ReactElement | false;
  filters?: ReactNode[];
  pagination?: ReactNode;
  searchPlaceholder?: string;
  searchSource?: string;
  title?: ReactNode | string | false;
  className?: string;
}
