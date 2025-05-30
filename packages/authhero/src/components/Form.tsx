import { PropsWithChildren } from "hono/jsx";

type Props = {
  className?: string;
};

const FormComponent = ({ children, className }: PropsWithChildren<Props>) => {
  return (
    <form id="form" method="post" className={className}>
      {children}
    </form>
  );
};

export default FormComponent;
