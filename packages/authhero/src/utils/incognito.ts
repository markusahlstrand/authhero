const INCOGNITO_SESSION_KEY = "authhero_incognito_mode";
const INCOGNITO_SCRIPT_URL = "https://unpkg.com/detectincognitojs@1.6.2";

/**
 * Dynamically loads the detectincognito library from unpkg CDN
 * @returns Promise resolving to the detectIncognito function
 */
async function loadDetectIncognitoLib(): Promise<
  (args?: any) => Promise<{ isPrivate: boolean }>
> {
  // Check if already loaded in window
  if ((window as any).detectIncognito) {
    return (window as any).detectIncognito;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = INCOGNITO_SCRIPT_URL;
    script.type = "text/javascript";
    script.crossOrigin = "anonymous";

    script.onload = () => {
      // Try different possible locations
      let detectIncognito = (window as any).detectIncognito;

      // Also check for default export
      if (!detectIncognito && (window as any).__detectIncognito) {
        detectIncognito = (window as any).__detectIncognito;
      }

      // Check module patterns
      if (
        !detectIncognito &&
        (window as any).module &&
        (window as any).module.exports
      ) {
        detectIncognito = (window as any).module.exports;
      }

      if (detectIncognito && typeof detectIncognito === "function") {
        resolve(detectIncognito);
      } else if (detectIncognito && detectIncognito.detectIncognito) {
        resolve(detectIncognito.detectIncognito);
      } else if (
        typeof detectIncognito === "object" &&
        detectIncognito.default
      ) {
        resolve(detectIncognito.default);
      } else {
        reject(new Error("detectIncognito not found after loading script"));
      }
    };

    script.onerror = () => {
      reject(new Error("Failed to load detectincognitojs script"));
    };

    document.head.appendChild(script);
  });
}

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

    // Load the detection library
    const detectIncognito = await loadDetectIncognitoLib();

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
