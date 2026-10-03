import type { UiScreen } from "@authhero/adapter-interfaces";

/**
 * Surface a screen handler's `error` as a screen-level message, unless the
 * re-rendered screen already shows an error (on a field or at screen level).
 *
 * Handlers usually attach a localized message to the offending field, so
 * adding `error` on top would show the same problem twice. The fallback only
 * kicks in for handlers that return an error without rendering one, so the
 * user isn't left with an unchanged screen and no explanation.
 */
export function withHandlerError(screen: UiScreen, error: string): UiScreen {
  const showsError =
    screen.messages?.some((m) => m.type === "error") ||
    screen.components.some(
      (c) => "messages" in c && c.messages?.some((m) => m.type === "error"),
    );

  if (showsError) {
    return screen;
  }

  return {
    ...screen,
    messages: [...(screen.messages ?? []), { text: error, type: "error" }],
  };
}
