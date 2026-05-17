import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import {
  ConnectionMethod,
  DomainConfig,
  formatDomain,
  getDomainFromStorage,
  saveDomainToStorage,
  saveSelectedDomainToStorage,
} from "@/utils/domainUtils";
import { getBasePath } from "@/utils/runtimeConfig";

interface DomainSelectorProps {
  onDomainSelected: (domain: string) => void;
  disableCloseOnRootPath?: boolean;
}

export function DomainSelector({
  onDomainSelected,
  disableCloseOnRootPath = false,
}: DomainSelectorProps) {
  const [domains, setDomains] = useState<DomainConfig[]>([]);
  const [inputDomain, setInputDomain] = useState("");
  const [inputClientId, setInputClientId] = useState("");
  const [inputRestApiUrl, setInputRestApiUrl] = useState("");
  const [inputToken, setInputToken] = useState("");
  const [inputClientSecret, setInputClientSecret] = useState("");
  const [connectionMethod, setConnectionMethod] =
    useState<ConnectionMethod>("login");
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setDomains(getDomainFromStorage());
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next && disableCloseOnRootPath) return;
    if (!next && domains.length === 0) return;
    setOpen(next);
  };

  const selectDomainAndNavigate = (domain: string) => {
    saveSelectedDomainToStorage(domain);
    onDomainSelected(domain);
    setOpen(false);

    const basePath = getBasePath();
    const currentPath = window.location.pathname;
    const relativePath =
      basePath && currentPath.startsWith(basePath)
        ? currentPath.slice(basePath.length) || "/"
        : currentPath;
    const pathSegments = relativePath.split("/").filter(Boolean);

    if (pathSegments.length > 0 && pathSegments[0] !== "tenants") {
      window.location.href = `${basePath}/${pathSegments[0]}`;
    } else {
      window.location.href = basePath + "/tenants";
    }
  };

  const handleAddDomain = () => {
    if (inputDomain.trim() === "") return;
    const formattedDomain = formatDomain(inputDomain);

    let newConfig: DomainConfig;
    switch (connectionMethod) {
      case "login":
        newConfig = {
          url: formattedDomain,
          connectionMethod: "login",
          clientId: inputClientId,
          restApiUrl: inputRestApiUrl.trim() || undefined,
        };
        break;
      case "token":
        newConfig = {
          url: formattedDomain,
          connectionMethod: "token",
          token: inputToken,
        };
        break;
      case "client_credentials":
        newConfig = {
          url: formattedDomain,
          connectionMethod: "client_credentials",
          clientId: inputClientId,
          clientSecret: inputClientSecret,
        };
        break;
      default:
        return;
    }

    const exists = domains.some((d) => d.url === formattedDomain);
    const next = exists
      ? domains.map((d) => (d.url === formattedDomain ? newConfig : d))
      : [...domains, newConfig];
    saveDomainToStorage(next);
    setDomains(next);
    setInputDomain("");
    setInputClientId("");
    setInputRestApiUrl("");
    setInputToken("");
    setInputClientSecret("");
  };

  const handleRemoveDomain = (url: string) => {
    const next = domains.filter((d) => d.url !== url);
    setDomains(next);
    saveDomainToStorage(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Select Auth Domain</DialogTitle>
          <DialogDescription>
            Choose an authentication domain to connect to, or add a new one.
          </DialogDescription>
        </DialogHeader>

        {domains.length > 0 && (
          <div className="flex flex-col gap-1 max-h-60 overflow-y-auto border rounded-md p-1">
            {domains.map((d) => (
              <div
                key={d.url}
                className="flex items-center justify-between rounded-sm px-3 py-2 hover:bg-accent cursor-pointer"
                onClick={() => selectDomainAndNavigate(formatDomain(d.url))}
              >
                <div className="flex flex-col">
                  <span className="font-medium">{d.url}</span>
                  <span className="text-xs text-muted-foreground">
                    {d.connectionMethod === "login"
                      ? "Login"
                      : d.connectionMethod === "token"
                        ? "API Token"
                        : "Client Credentials"}
                    {d.clientId ? ` · ${d.clientId}` : ""}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveDomain(d.url);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t pt-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ds-domain">Domain</Label>
            <Input
              id="ds-domain"
              placeholder="auth.example.com"
              value={inputDomain}
              onChange={(e) => setInputDomain(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Connection method</Label>
            <Select
              value={connectionMethod}
              onValueChange={(v) => setConnectionMethod(v as ConnectionMethod)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="login">Login</SelectItem>
                <SelectItem value="token">API Token</SelectItem>
                <SelectItem value="client_credentials">
                  Client Credentials
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {connectionMethod === "login" && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ds-clientid">Client ID</Label>
                <Input
                  id="ds-clientid"
                  value={inputClientId}
                  onChange={(e) => setInputClientId(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ds-rest">REST API URL (optional)</Label>
                <Input
                  id="ds-rest"
                  placeholder="https://api.example.com"
                  value={inputRestApiUrl}
                  onChange={(e) => setInputRestApiUrl(e.target.value)}
                />
              </div>
            </>
          )}

          {connectionMethod === "token" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="ds-token">API Token</Label>
              <Input
                id="ds-token"
                type="password"
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
              />
            </div>
          )}

          {connectionMethod === "client_credentials" && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ds-cc-id">Client ID</Label>
                <Input
                  id="ds-cc-id"
                  value={inputClientId}
                  onChange={(e) => setInputClientId(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ds-cc-secret">Client Secret</Label>
                <Input
                  id="ds-cc-secret"
                  type="password"
                  value={inputClientSecret}
                  onChange={(e) => setInputClientSecret(e.target.value)}
                />
              </div>
            </>
          )}

          <Button onClick={handleAddDomain} disabled={!inputDomain.trim()}>
            Save domain
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
