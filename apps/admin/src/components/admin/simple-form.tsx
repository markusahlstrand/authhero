import * as React from "react";
import type { ReactNode } from "react";
import { Children } from "react";
import type { FormProps } from "ra-core";
import { Form } from "ra-core";
import { useFormState } from "react-hook-form";
import { cn } from "@/lib/utils";
import { CancelButton } from "@/components/admin/cancel-button";
import { SaveButton } from "@/components/admin/form";

/**
 * A simple form layout with vertical stacking, validation, and default toolbar.
 *
 * Automatically includes a toolbar with Cancel and Save buttons unless you provide a custom toolbar.
 *
 * @see {@link https://marmelab.com/shadcn-admin-kit/docs/simpleform/ SimpleForm documentation}
 *
 * @example
 * import { Create, SimpleForm, TextInput } from '@/components/admin';
 *
 * const PostCreate = () => (
 *   <Create>
 *     <SimpleForm>
 *       <TextInput source="title" />
 *       <TextInput source="body" />
 *     </SimpleForm>
 *   </Create>
 * );
 */
export const SimpleForm = ({
  children,
  className,
  toolbar = defaultFormToolbar,
  ...rest
}: SimpleFormProps) => (
  <Form
    className={cn(`flex flex-col gap-4 w-full max-w-lg`, className)}
    {...rest}
  >
    {children}
    {toolbar}
  </Form>
);

/**
 * A sticky form toolbar with default Cancel and Save buttons.
 *
 * Provides a consistent action bar for forms that sticks to the bottom of the viewport. By default,
 * renders Cancel and Save buttons, but you can provide custom buttons as children.
 *
 * @example
 * import { FormToolbar, CancelButton, SaveButton } from '@/components/admin';
 *
 * const CustomToolbar = () => (
 *     <FormToolbar>
 *         <CancelButton />
 *         <SaveButton label="Publish" />
 *     </FormToolbar>
 * );
 */
export const FormToolbar = ({
  children,
  className,
  ...rest
}: FormToolbarProps) => {
  const { isDirty } = useFormState();
  if (!isDirty) return null;
  return (
    <div
      {...rest}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-muted/95 backdrop-blur-sm shadow-[0_-6px_20px_rgba(0,0,0,0.08)] animate-in slide-in-from-bottom duration-200 ease-out",
        className,
      )}
      role="toolbar"
    >
      <div className="px-6 py-3">
        {Children.count(children) === 0 ? (
          <div className="flex flex-row gap-2 justify-end">
            <CancelButton />
            <SaveButton />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

export type SimpleFormProps = {
  children: ReactNode;
  className?: string;
  toolbar?: ReactNode;
} & FormProps;

export interface FormToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  className?: string;
}

const defaultFormToolbar = <FormToolbar />;
