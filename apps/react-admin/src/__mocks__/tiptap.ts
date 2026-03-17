// Mock for @tiptap/* packages that have broken exports in Vitest
export const useEditor = () => null;
export const EditorContent = () => null;
export const StarterKit = {};
export const Link = { configure: () => ({}) };
export const Underline = {};
export default {};
