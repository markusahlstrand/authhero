import { customAlphabet } from "nanoid";

const ID_LENGTH = 24;

export function userIdGenerate() {
  const alphabet = "0123456789abcdef";

  const generateHexId = customAlphabet(alphabet, ID_LENGTH);

  const hexId = generateHexId();
  return hexId;
}

export function userIdParse(userId: string) {
  if (!userId.includes("|")) {
    console.error("Invalid user_id format");
    return userId;
  }

  const [, id] = userId.split("|");

  return id;
}
