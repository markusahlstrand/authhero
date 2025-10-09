import type { FC } from "hono/jsx";
import { PropsWithChildren } from "hono/jsx";
import cn from "classnames";

export interface LabelProps {
  htmlFor?: string;
  className?: string;
  style?: Record<string, string | number>;
}

const Label: FC<PropsWithChildren<LabelProps>> = ({
  htmlFor,
  className,
  style,
  children,
}) => {
  return (
    <label
      for={htmlFor}
      className={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
        className,
      )}
      style={style}
    >
      {children}
    </label>
  );
};

export default Label;
