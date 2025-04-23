export function getConnectionFromUsername(username: string) {
  // There are really 3 opions here: email, sms or username
  // username is not supported yet, so we can just use email or sms
  return username.includes("@") ? "email" : "sms";
}
