import { getLogTypeCategory } from "@/lib/logs";
import { Check, X, Mail, AlertCircle, Info, HelpCircle } from "lucide-react";

export function LogIcon({ type }: { type: string }) {
  switch (getLogTypeCategory(type)) {
    case "success":
      return <Check className="h-4 w-4 text-green-600" />;
    case "failure":
      return <X className="h-4 w-4 text-red-600" />;
    case "warning":
      return <AlertCircle className="h-4 w-4 text-amber-600" />;
    case "code_sent":
      return <Mail className="h-4 w-4 text-blue-600" />;
    case "info":
      return <Info className="h-4 w-4 text-blue-600" />;
    default:
      return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
  }
}
