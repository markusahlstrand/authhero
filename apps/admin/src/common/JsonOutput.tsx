export function JsonOutput({ data }: { data: unknown }) {
  return (
    <pre className="bg-muted text-foreground border rounded-md p-3 text-sm font-mono overflow-auto m-0">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
