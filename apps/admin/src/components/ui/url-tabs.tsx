import * as React from "react";
import { useSearchParams } from "react-router-dom";

import { Tabs } from "@/components/ui/tabs";

type TabsProps = React.ComponentProps<typeof Tabs>;

export interface UrlTabsProps extends Omit<
  TabsProps,
  "value" | "onValueChange"
> {
  param?: string;
}

export function UrlTabs({
  param = "tab",
  defaultValue,
  ...props
}: UrlTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const current =
    searchParams.get(param) ?? (defaultValue as string | undefined);

  const handleChange = React.useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === defaultValue) {
            next.delete(param);
          } else {
            next.set(param, value);
          }
          return next;
        },
        { replace: true },
      );
    },
    [param, defaultValue, setSearchParams],
  );

  return (
    <Tabs
      {...props}
      value={current}
      defaultValue={defaultValue}
      onValueChange={handleChange}
    />
  );
}
