import { parsePhoneNumberFromString, CountryCode } from "libphonenumber-js";

type ConnectionType = "email" | "sms" | "username";

interface NormalizedResult {
  connection: ConnectionType;
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
      connection: "email",
      normalized: isValid ? normalized : null,
      isValid,
    };
  } else if (/^\+?\d[\d\s\-().]*$/.test(username)) {
    const phoneNumber = parsePhoneNumberFromString(username, {
      defaultCountry,
    });
    if (phoneNumber && phoneNumber.isValid()) {
      return {
        connection: "sms",
        normalized: phoneNumber.number, // E.164 format
        isValid: true,
      };
    } else {
      return {
        connection: "sms",
        normalized: null,
        isValid: false,
      };
    }
  } else {
    return {
      connection: "username",
      normalized: username,
      isValid: true,
    };
  }
}
