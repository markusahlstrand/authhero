import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { FormNodeComponent } from "../types";
import { COMPONENT_TYPE_OPTIONS } from "../constants";
import { RichTextComponentEditor } from "./component-editors/RichTextComponentEditor";
import { NextButtonEditor } from "./component-editors/NextButtonEditor";
import { TextFieldEditor } from "./component-editors/TextFieldEditor";
import { DropdownChoiceCustomEditor } from "./component-editors/DropdownChoiceCustomEditor";
import { DateEditor } from "./component-editors/DateEditor";
import { LegalEditor } from "./component-editors/LegalEditor";
import { FallbackJsonEditor } from "./component-editors/FallbackJsonEditor";

const TEXT_LIKE = ["TEXT", "EMAIL", "NUMBER", "TEL", "URL", "PASSWORD"];

const FIELD_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;

interface ComponentEditorDialogProps {
  open: boolean;
  component: FormNodeComponent | null;
  /** IDs of the other components in the step, to keep renamed IDs unique. */
  takenIds?: string[];
  onClose: () => void;
  onSave: (next: FormNodeComponent) => void;
}

export function ComponentEditorDialog({
  open,
  component,
  takenIds = [],
  onClose,
  onSave,
}: ComponentEditorDialogProps) {
  const [draft, setDraft] = useState<FormNodeComponent | null>(component);
  const [valid, setValid] = useState(true);

  useEffect(() => {
    setDraft(component);
    setValid(true);
  }, [component]);

  if (!component) return null;

  const idError = (() => {
    if (!draft) return null;
    if (!draft.id) return "Field ID is required";
    if (!FIELD_ID_PATTERN.test(draft.id))
      return "Use letters, numbers, _ or -, starting with a letter";
    if (takenIds.includes(draft.id))
      return "Another component already uses this ID";
    return null;
  })();

  const typeLabel =
    COMPONENT_TYPE_OPTIONS.find((opt) => opt.type === component.type)?.label ??
    component.type;

  // The fallback JSON editor already exposes the id; only bespoke editors
  // need the dedicated Field ID input.
  const hasBespokeEditor =
    !!draft &&
    ([
      "RICH_TEXT",
      "NEXT_BUTTON",
      "DROPDOWN",
      "CHOICE",
      "CUSTOM",
      "DATE",
      "LEGAL",
    ].includes(draft.type) ||
      TEXT_LIKE.includes(draft.type));
  const showIdInput = !!draft && draft.category === "FIELD" && hasBespokeEditor;

  const renderEditor = () => {
    if (!draft) return null;
    if (draft.type === "RICH_TEXT") {
      return (
        <RichTextComponentEditor
          value={draft}
          onChange={(next) => setDraft(next)}
        />
      );
    }
    if (draft.type === "NEXT_BUTTON") {
      return (
        <NextButtonEditor value={draft} onChange={(next) => setDraft(next)} />
      );
    }
    if (TEXT_LIKE.includes(draft.type)) {
      return (
        <TextFieldEditor value={draft} onChange={(next) => setDraft(next)} />
      );
    }
    if (
      draft.type === "DROPDOWN" ||
      draft.type === "CHOICE" ||
      draft.type === "CUSTOM"
    ) {
      return (
        <DropdownChoiceCustomEditor
          value={draft}
          onChange={(next) => setDraft(next)}
        />
      );
    }
    if (draft.type === "DATE") {
      return <DateEditor value={draft} onChange={(next) => setDraft(next)} />;
    }
    if (draft.type === "LEGAL") {
      return <LegalEditor value={draft} onChange={(next) => setDraft(next)} />;
    }
    return (
      <FallbackJsonEditor
        value={draft}
        onChange={(next, isValid) => {
          setDraft(next);
          setValid(isValid);
        }}
      />
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{typeLabel}</DialogTitle>
          <DialogDescription>
            Edit settings for this component. Changes apply on save.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-1 py-2">
          {showIdInput && draft && (
            <div className="mb-3 flex flex-col gap-1.5">
              <Label className="text-xs">Field ID</Label>
              <Input
                value={draft.id}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    id: e.target.value,
                  } as FormNodeComponent)
                }
              />
              {idError ? (
                <p className="text-xs text-destructive">{idError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Referenced from flows as{" "}
                  <code className="font-mono">{`{{fields.${draft.id}}}`}</code>.
                  Renaming breaks existing references.
                </p>
              )}
            </div>
          )}
          {renderEditor()}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!valid || !draft || (showIdInput && idError !== null)}
            onClick={() => {
              if (draft) {
                onSave(draft);
                onClose();
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
