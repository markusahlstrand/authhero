import { useInput, FieldTitle, type InputProps } from "ra-core";
import {
  FormControl,
  FormError,
  FormField,
  FormLabel,
} from "@/components/admin/form";
import { Input } from "@/components/ui/input";
import { InputHelperText } from "@/components/admin/input-helper-text";

type ColorInputProps = InputProps & {
  helperText?: React.ReactNode;
};

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

export function ColorInput(props: ColorInputProps) {
  const { label, source, helperText } = props;
  const { id, field, isRequired } = useInput(props);

  const stringValue = typeof field.value === "string" ? field.value : "";
  const swatchValue = isHexColor(stringValue) ? stringValue : "#000000";

  return (
    <FormField id={id} name={field.name}>
      {label !== false && (
        <FormLabel>
          <FieldTitle label={label} source={source} isRequired={isRequired} />
        </FormLabel>
      )}
      <FormControl>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={swatchValue}
            onChange={(e) => field.onChange(e.target.value)}
            onBlur={field.onBlur}
            className="h-9 w-10 cursor-pointer rounded-md border border-input bg-transparent p-1"
            aria-label={typeof label === "string" ? label : source}
          />
          <Input
            type="text"
            value={stringValue}
            onChange={(e) => field.onChange(e.target.value)}
            onBlur={field.onBlur}
            placeholder="#000000"
            className="flex-1 font-mono"
          />
        </div>
      </FormControl>
      <InputHelperText helperText={helperText} />
      <FormError />
    </FormField>
  );
}
