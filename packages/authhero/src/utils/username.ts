import { parsePhoneNumberFromString, CountryCode } from "libphonenumber-js";

type ConnectionType = "email" | "sms" | "username";

interface NormalizedResult {
  connectionType: ConnectionType;
  normalized: string | null;
  isValid: boolean;
}

export function getConnectionFromIdentifier(
  input: string,
  defaultCountry: CountryCode = "US",
): NormalizedResult {
  const username = input.trim();

  if (username.includes("@")) {
    const normalized = username.toLowerCase();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    return {
      connectionType: "email",
      normalized: isValid ? normalized : null,
      isValid,
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
      };
    } else {
      return {
        connectionType: "sms",
        normalized: null,
        isValid: false,
      };
    }
  } else {
    return {
      connectionType: "username",
      normalized: username,
      isValid: true,
    };
  }
}
