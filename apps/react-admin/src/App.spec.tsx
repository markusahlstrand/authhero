import { render, screen } from "@testing-library/react";
import { test, vi, expect } from "vitest";
import { App } from "./App";

// Mock all the react-admin components and dependencies
vi.mock("react-admin", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    Admin: ({ children }: any) => <div data-testid="admin">{children}</div>,
    Resource: () => <div data-testid="resource" />,
    ShowGuesser: () => <div data-testid="show-guesser" />,
  };
});

vi.mock("./dataProvider", () => ({
  getDataproviderForTenant: () =>
    Promise.resolve(() => Promise.resolve({ data: [] })),
  getDataprovider: () => Promise.resolve(() => Promise.resolve({ data: [] })),
}));

vi.mock("./authProvider", () => ({
  getAuthProvider: () => ({}),
}));

vi.mock("./utils/domainUtils", () => ({
  getSelectedDomainFromStorage: () => ({ url: "test.com", clientId: "test" }),
  getDomainFromStorage: () => [],
  buildUrlWithProtocol: (url: string) => `https://${url}`,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useLocation: () => ({ pathname: "/" }),
  };
});

// Mock color picker to avoid CSS import issues in tests
vi.mock("react-admin-color-picker", () => ({
  ColorInput: () => null,
  ColorField: () => null,
}));

test.skip("should pass", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  render(<App tenantId="test" />);

  // Just check that something renders
  expect(screen.getByTestId("admin")).toBeTruthy();
}, 10000);
