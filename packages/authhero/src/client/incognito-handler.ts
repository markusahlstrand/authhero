import { detectAndCacheIncognito, isIncognito } from "../utils/incognito";

/**
 * IncognitoDetectionHandler - Detects incognito mode and shows the warning
 * This runs on the client-side after page load
 */
export const IncognitoDetectionHandler = () => {
  // Check if we already have the result cached
  const cached = isIncognito();

  if (cached !== undefined) {
    // We have a cached result, show warning if needed
    if (cached) {
      showIncognitoWarning();
    }
    return;
  }

  // Otherwise, perform detection
  detectAndCacheIncognito()
    .then((isIncognitoMode) => {
      if (isIncognitoMode) {
        showIncognitoWarning();
      }
    })
    .catch(() => {
      // If detection fails, don't show warning
    });
};

function showIncognitoWarning() {
  const container = document.getElementById("incognito-warning-container");
  if (!container) return;

  // Remove the hidden class to show the warning
  container.classList.remove("hidden");
}
