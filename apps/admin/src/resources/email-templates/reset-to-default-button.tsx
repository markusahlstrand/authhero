import { useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  useDelete,
  useNotify,
  useRecordContext,
  useRefresh,
  useResourceContext,
} from "ra-core";
import { Button } from "@/components/ui/button";
import { Confirm } from "@/components/admin/confirm";

interface EmailTemplateRecord {
  id: string;
  is_override?: boolean;
}

export function ResetToDefaultButton() {
  const record = useRecordContext<EmailTemplateRecord>();
  const resource = useResourceContext();
  const [open, setOpen] = useState(false);
  const [deleteOne, { isPending }] = useDelete();
  const notify = useNotify();
  const refresh = useRefresh();

  if (!record?.is_override) return null;

  const handleConfirm = () => {
    deleteOne(
      resource,
      { id: record.id, previousData: record },
      {
        onSuccess: () => {
          setOpen(false);
          notify("Template reset to default", { type: "info" });
          refresh();
        },
        onError: () => {
          setOpen(false);
          notify("Failed to reset template", { type: "error" });
        },
      },
    );
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <RotateCcw className="size-4" />
        Reset to default
      </Button>
      <Confirm
        isOpen={open}
        title="Reset template to default?"
        content="Your customizations will be discarded and the bundled default will be used."
        onConfirm={handleConfirm}
        onClose={() => setOpen(false)}
        loading={isPending}
      />
    </>
  );
}
