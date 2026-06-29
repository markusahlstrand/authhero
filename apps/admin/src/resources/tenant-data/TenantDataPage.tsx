import { useRef, useState } from "react";
import { useDataProvider, useNotify } from "ra-core";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, Loader2, Upload } from "lucide-react";
import type { AuthHeroDataProvider } from "../../auth0DataProvider";

type ImportResult = {
  counts: Record<string, number>;
  errors: { entity: string; error: string }[];
};

export function TenantDataPage() {
  const dataProvider = useDataProvider<AuthHeroDataProvider>();
  const notify = useNotify();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [exportHashes, setExportHashes] = useState(false);
  const [importHashes, setImportHashes] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await dataProvider.exportTenantData(exportHashes);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "tenant-export.jsonl.gz";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      notify("Tenant data exported", { type: "success" });
    } catch (err) {
      notify(err instanceof Error ? err.message : "Export failed", {
        type: "error",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setResult(null);
    try {
      const importResult = await dataProvider.importTenantData(
        file,
        importHashes,
      );
      setResult(importResult);
      const total = Object.values(importResult.counts).reduce(
        (a, b) => a + b,
        0,
      );
      notify(
        `Imported ${total} records${importResult.errors.length ? ` with ${importResult.errors.length} errors` : ""}`,
        { type: importResult.errors.length ? "warning" : "success" },
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Import failed", {
        type: "error",
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Import / Export</h1>
        <p className="text-muted-foreground text-sm">
          Move a tenant's configuration and users between deployments. Sessions,
          refresh tokens and logs are not included; signing keys are regenerated
          on import.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export</CardTitle>
          <CardDescription>
            Download this tenant's durable data as a JSON-lines file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="export-hashes"
              checked={exportHashes}
              onCheckedChange={(v) => setExportHashes(v === true)}
            />
            <Label htmlFor="export-hashes">
              Include password hashes (requires elevated permission)
            </Label>
          </div>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            Export tenant data
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Import</CardTitle>
          <CardDescription>
            Load a previously exported file (.jsonl or .jsonl.gz) into this
            tenant. Existing records with the same id are left unchanged.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="import-hashes"
              checked={importHashes}
              onCheckedChange={(v) => setImportHashes(v === true)}
            />
            <Label htmlFor="import-hashes">
              Import password hashes (requires elevated permission)
            </Label>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jsonl,.json,.gz,.ndjson"
            className="hidden"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void handleImportFile(file);
            }}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? <Loader2 className="animate-spin" /> : <Upload />}
            Choose file and import
          </Button>

          {result && (
            <div className="space-y-3">
              <Alert>
                <AlertDescription>
                  Imported{" "}
                  {Object.entries(result.counts)
                    .map(([entity, count]) => `${count} ${entity}`)
                    .join(", ") || "nothing"}
                  .
                </AlertDescription>
              </Alert>
              {result.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertDescription>
                    <p className="font-medium">
                      {result.errors.length} rows failed:
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-xs">
                      {result.errors.slice(0, 20).map((e, i) => (
                        <li key={i}>
                          {e.entity}: {e.error}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
