import type { FC } from "hono/jsx";
import { PropsWithChildren } from "hono/jsx";
import cn from "classnames";

export interface CardProps {
  className?: string;
  style?: Record<string, string | number>;
}

const Card: FC<PropsWithChildren<CardProps>> = ({
  children,
  className,
  style,
}) => {
  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800",
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
};

export interface CardHeaderProps {
  className?: string;
}

export const CardHeader: FC<PropsWithChildren<CardHeaderProps>> = ({
  children,
  className,
}) => {
  return (
    <div className={cn("flex flex-col space-y-1.5 p-6", className)}>
      {children}
    </div>
  );
};

export interface CardTitleProps {
  className?: string;
  style?: Record<string, string | number>;
}

export const CardTitle: FC<PropsWithChildren<CardTitleProps>> = ({
  children,
  className,
  style,
}) => {
  return (
    <h3
      className={cn(
        "text-2xl font-semibold leading-none tracking-tight",
        className,
      )}
      style={style}
    >
      {children}
    </h3>
  );
};

export interface CardDescriptionProps {
  className?: string;
  style?: Record<string, string | number>;
}

export const CardDescription: FC<PropsWithChildren<CardDescriptionProps>> = ({
  children,
  className,
  style,
}) => {
  return (
    <p
      className={cn("text-sm text-gray-500 dark:text-gray-400", className)}
      style={style}
    >
      {children}
    </p>
  );
};

export interface CardContentProps {
  className?: string;
}

export const CardContent: FC<PropsWithChildren<CardContentProps>> = ({
  children,
  className,
}) => {
  return <div className={cn("p-6 pt-0", className)}>{children}</div>;
};

export interface CardFooterProps {
  className?: string;
}

export const CardFooter: FC<PropsWithChildren<CardFooterProps>> = ({
  children,
  className,
}) => {
  return (
    <div className={cn("flex items-center p-6 pt-0", className)}>
      {children}
    </div>
  );
};

export default Card;
