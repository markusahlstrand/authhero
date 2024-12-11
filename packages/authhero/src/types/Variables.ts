export type Variables = {
  tenant_id: string;
  client_id?: string;
  user_id?: string;
  username?: string;
  connection?: string;
  body?: any;
  // This is set by auth middleware
  user?: { sub: string; tenant_id: string };
};
