import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
} from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Separator } from "@/components/ui/separator";

import { LinkPopover } from "./LinkPopover";

interface RichTextEditorProps {
  value: string;
  onChange: (next: string) => void;
}

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: value || "",
    onUpdate: ({ editor: inst }) => {
      onChange(inst.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[140px] rounded-md border bg-background px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== (value || "")) {
      editor.commands.setContent(value || "", false);
    }
  }, [editor, value]);

  if (!editor) {
    return (
      <div className="min-h-[140px] rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Loading editor…
      </div>
    );
  }

  const marks = [
    editor.isActive("bold") ? "bold" : null,
    editor.isActive("italic") ? "italic" : null,
    editor.isActive("underline") ? "underline" : null,
  ].filter(Boolean) as string[];

  const lists = editor.isActive("bulletList")
    ? "bullet"
    : editor.isActive("orderedList")
      ? "ordered"
      : "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 rounded-md border bg-muted/30 p-1">
        <ToggleGroup
          type="multiple"
          value={marks}
          onValueChange={() => {}}
          size="sm"
        >
          <ToggleGroupItem
            value="bold"
            aria-label="Bold"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="italic"
            aria-label="Italic"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="underline"
            aria-label="Underline"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
        <Separator orientation="vertical" className="!h-5" />
        <ToggleGroup type="single" value={lists} size="sm">
          <ToggleGroupItem
            value="bullet"
            aria-label="Bullet list"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="ordered"
            aria-label="Ordered list"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
        <Separator orientation="vertical" className="!h-5" />
        <LinkPopover
          isActive={editor.isActive("link")}
          initialHref={editor.getAttributes("link").href as string | undefined}
          onApply={(href) =>
            editor.chain().focus().extendMarkRange("link").setLink({ href }).run()
          }
          onClear={() =>
            editor.chain().focus().extendMarkRange("link").unsetLink().run()
          }
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
