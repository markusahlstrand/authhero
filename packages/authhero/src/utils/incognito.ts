import { detectIncognito } from "detectincognitojs";

const INCOGNITO_SESSION_KEY = "authhero_incognito_mode";

/**
 * Synchronously checks if the browser is in incognito mode by reading from session storage
 * @returns true if incognito, false if not incognito, undefined if not yet determined
 */
export function isIncognito(): boolean | undefined {
  try {
    const storedValue = sessionStorage.getItem(INCOGNITO_SESSION_KEY);
    if (storedValue === null) {
      return undefined;
    }
    return storedValue === "true";
  } catch {
    // Session storage might not be available
    return undefined;
  }
}

/**
 * Detects incognito mode using the detectincognitojs library and persists the result to session storage
 * Only performs detection if not already cached in session storage
 * @returns Promise<boolean> indicating if the browser is in incognito mode
 */
export async function detectAndCacheIncognito(): Promise<boolean> {
  try {
    // Check if we already have the result cached
    const cachedValue = sessionStorage.getItem(INCOGNITO_SESSION_KEY);
    if (cachedValue !== null) {
      return cachedValue === "true";
    }

    // Perform the actual detection
    const { isPrivate } = await detectIncognito();

    // Cache the result
    sessionStorage.setItem(INCOGNITO_SESSION_KEY, isPrivate.toString());

    return isPrivate;
  } catch (error) {
    // If detection fails, assume not incognito and cache the result
    try {
      sessionStorage.setItem(INCOGNITO_SESSION_KEY, "false");
    } catch {
      // Session storage might not be available
    }
    return false;
  }
}
