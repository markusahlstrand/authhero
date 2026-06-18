// Format an ISO date (YYYY-MM-DD) as e.g. "March 15, 2026".
// Parsed as UTC so the displayed day never shifts with the viewer's timezone.
export const formatDate = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
