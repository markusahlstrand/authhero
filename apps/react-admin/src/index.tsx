import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { TenantsApp } from "./TenantsApp";

function Root() {
  const pathSegments = location.pathname.split("/").filter(Boolean); // Splits path into segments and filters out any empty segments
  const tenantId = pathSegments[0];

  //   if (!tenantId || ["tenants", "auth-callback"].includes(tenantId)) {
  return (
    <React.StrictMode>
      <BrowserRouter>
        <TenantsApp />
      </BrowserRouter>
    </React.StrictMode>
  );
  //   }

  //   return (
  //     <React.StrictMode>
  //       <BrowserRouter basename={tenantId}>
  //         <App tenantId={tenantId} />
  //       </BrowserRouter>
  //     </React.StrictMode>
  //   );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<Root />);
