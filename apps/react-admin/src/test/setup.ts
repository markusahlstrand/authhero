// Mock the widget loader for tests since the package may not be built
vi.mock("@authhero/widget/loader", () => ({
  defineCustomElements: vi.fn(),
}));
