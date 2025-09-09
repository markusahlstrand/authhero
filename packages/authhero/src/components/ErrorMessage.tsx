import cn from "classnames";

type Props = {
  children: string;
  className?: string;
};

const ErrorMessage = ({ children, className }: Props) => {
  return (
    <div className={cn("mb-2 text-sm text-red", className)}>{children}</div>
  );
};

export default ErrorMessage;
