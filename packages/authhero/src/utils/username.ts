import { parsePhoneNumberFromString, CountryCode } from "libphonenumber-js";

type ConnectionType = "email" | "sms" | "username";

interface NormalizedResult {
  connectionType: ConnectionType;
  normalized: string | null;
  isValid: boolean;
  /** The provider to use for user lookup. For email, this is "email" but password users use "auth2" */
  provider: string;
}

export function getConnectionFromIdentifier(
  input: string,
  defaultCountry: CountryCode = "US",
): NormalizedResult {
  const username = input.trim();

  // INVARIANT: plain usernames must not contain "@", enforced by
  // baseUserSchema in adapter-interfaces. Any input containing "@" is
  // therefore safe to classify as an email identifier.
  if (username.includes("@")) {
    const normalized = username.toLowerCase();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    return {
      connectionType: "email",
      normalized: isValid ? normalized : null,
      isValid,
      provider: "email",
    };
  } else if (/^\+?\d[\d\s\-().]*$/.test(username)) {
    const phoneNumber = parsePhoneNumberFromString(username, {
      defaultCountry,
    });
    if (phoneNumber && phoneNumber.isValid()) {
      return {
        connectionType: "sms",
        normalized: phoneNumber.number, // E.164 format
        isValid: true,
        provider: "sms",
      };
    } else {
      return {
        connectionType: "sms",
        normalized: null,
        isValid: false,
        provider: "sms",
      };
    }
  } else {
    return {
      connectionType: "username",
      normalized: username,
      isValid: true,
      provider: "auth2",
    };
  }
}
