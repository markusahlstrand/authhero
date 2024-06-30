import { CreateButton, ExportButton, TopToolbar } from "react-admin";

export function PostListActions() {
  return (
    <TopToolbar>
      <CreateButton />
      <ExportButton />
    </TopToolbar>
  );
}
