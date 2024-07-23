export function parseUserId(user_id: string): {
  connection: string;
  id: string;
} {
  const [connection, id] = user_id.split("|");

  if (!connection || !id) {
    throw new Error(`Invalid user_id: ${user_id}`);
  }

  return { connection, id };
}
