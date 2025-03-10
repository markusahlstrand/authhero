type Props = {
  children: string;
};

const ErrorMessage = ({ children }: Props) => {
  return <div className="mb-2 text-sm text-red">{children}</div>;
};

export default ErrorMessage;
