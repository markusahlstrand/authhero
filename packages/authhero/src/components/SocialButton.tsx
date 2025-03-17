import cn from "classnames";
import Button from "./Button";
import { LoginSession } from "@authhero/adapter-interfaces";

type Props = {
  connection: "google-oauth2" | "apple" | "facebook" | "vipps";
  // TODO - what is the correct type here in hono/jsx? OR use a children prop
  icon: any;
  text: string;
  canResize?: boolean;
  loginSession: LoginSession;
};

const SocialButton = ({
  connection,
  text,
  icon = null,
  canResize = false,
  loginSession,
}: Props) => {
  const queryString = new URLSearchParams({
    client_id: loginSession.authParams.client_id,
    connection,
  });
  if (loginSession.authParams.response_type) {
    queryString.set("response_type", loginSession.authParams.response_type);
  }
  if (loginSession.authParams.redirect_uri) {
    queryString.set("redirect_uri", loginSession.authParams.redirect_uri);
  }
  if (loginSession.authParams.scope) {
    queryString.set("scope", loginSession.authParams.scope);
  }
  if (loginSession.authParams.nonce) {
    queryString.set("nonce", loginSession.authParams.nonce);
  }
  if (loginSession.authParams.response_type) {
    queryString.set("response_type", loginSession.authParams.response_type);
  }
  if (loginSession.authParams.state) {
    queryString.set("state", loginSession.id);
  }
  const href = `/authorize?${queryString.toString()}`;

  return (
    <Button
      className={cn(
        "border border-gray-200 bg-white hover:bg-gray-100 dark:border-gray-400 dark:bg-black dark:hover:bg-black/90",
        {
          ["px-0 py-3 sm:px-10 sm:py-4 short:px-0 short:py-3"]: canResize,
          ["px-10 py-3"]: !canResize,
        },
      )}
      variant="custom"
      aria-label={text}
      Component="a"
      href={href}
    >
      {icon || ""}
      <div
        className={cn("text-left text-black dark:text-white sm:text-base", {
          ["hidden sm:inline short:hidden"]: canResize,
        })}
      >
        {text}
      </div>
    </Button>
  );
};

export default SocialButton;
