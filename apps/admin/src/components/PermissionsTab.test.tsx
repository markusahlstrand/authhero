import { describe, it, expect, vi, beforeAll } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import {
  CoreAdminContext,
  RecordContextProvider,
  TestMemoryRouter,
  testDataProvider,
} from "ra-core";
import { Routes, Route } from "react-router-dom";
import { PermissionsTab } from "./PermissionsTab";

// Radix Select relies on pointer-capture / scroll APIs jsdom does not implement.
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  // @ts-expect-error jsdom lacks ResizeObserver
  globalThis.ResizeObserver ||= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const resourceServer = {
  id: "rs1",
  identifier: "https://api.example.com",
  name: "Example API",
  scopes: [
    { value: "read:things", description: "Read things" },
    { value: "write:things", description: "Write things" },
  ],
};

function renderUsersPermissionsTab(create: ReturnType<typeof vi.fn>) {
  const dataProvider = testDataProvider({
    // @ts-expect-error partial provider for the calls this tab makes
    getList: vi.fn((resource: string) => {
      if (resource === "resource-servers") {
        return Promise.resolve({ data: [resourceServer], total: 1 });
      }
      if (resource === "organizations") {
        return Promise.resolve({
          data: [{ id: "org1", name: "Org One", display_name: "Org One" }],
          total: 1,
        });
      }
      // users/u1/permissions (existing) + the ReferenceManyField list
      return Promise.resolve({ data: [], total: 0 });
    }),
    getManyReference: vi.fn(() => Promise.resolve({ data: [], total: 0 })),
    create,
  });

  return render(
    <TestMemoryRouter initialEntries={["/users/u1"]}>
      <CoreAdminContext dataProvider={dataProvider}>
        <Routes>
          <Route
            path="/users/:id"
            element={
              <RecordContextProvider value={{ id: "u1" }}>
                <PermissionsTab
                  resource="users"
                  target="user_id"
                  subjectNoun="user"
                  withOrgScope
                />
              </RecordContextProvider>
            }
          />
        </Routes>
      </CoreAdminContext>
    </TestMemoryRouter>,
  );
}

function renderRolesPermissionsTab(create: ReturnType<typeof vi.fn>) {
  const getManyReference = vi.fn(() => Promise.resolve({ data: [], total: 0 }));
  const dataProvider = testDataProvider({
    // @ts-expect-error partial provider for the calls this tab makes
    getList: vi.fn((resource: string) => {
      if (resource === "resource-servers") {
        return Promise.resolve({ data: [resourceServer], total: 1 });
      }
      return Promise.resolve({ data: [], total: 0 });
    }),
    getManyReference,
    create,
  });

  const utils = render(
    <TestMemoryRouter initialEntries={["/roles/r1"]}>
      <CoreAdminContext dataProvider={dataProvider}>
        <Routes>
          <Route
            path="/roles/:id"
            element={
              <RecordContextProvider value={{ id: "r1" }}>
                <PermissionsTab
                  resource="roles"
                  target="role_id"
                  subjectNoun="role"
                />
              </RecordContextProvider>
            }
          />
        </Routes>
      </CoreAdminContext>
    </TestMemoryRouter>,
  );
  return { ...utils, getManyReference };
}

describe("PermissionsTab (roles, no org scope)", () => {
  it("grants the scope with no organization_id and reads via getManyReference", async () => {
    const create = vi.fn(() => Promise.resolve({ data: { id: "x" } }));
    const { getManyReference } = renderRolesPermissionsTab(create);

    fireEvent.click(screen.getByRole("button", { name: /add permission/i }));
    fireEvent.click(await screen.findByText("Select a resource server"));
    fireEvent.click(await screen.findByText("Example API"));

    // Roles read existing permissions via the reference, not a flat list.
    await waitFor(() =>
      expect(getManyReference).toHaveBeenCalledWith(
        "permissions",
        expect.objectContaining({ target: "role_id", id: "r1" }),
      ),
    );

    // No organization picker in the roles variant.
    expect(screen.queryByText("No organization (tenant-wide)")).toBeNull();

    fireEvent.click(await screen.findByText("write:things"));
    fireEvent.click(
      await screen.findByRole("button", { name: /add 1 permission/i }),
    );

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith("roles/r1/permissions", {
      data: {
        permissions: [
          {
            permission_name: "write:things",
            resource_server_identifier: "https://api.example.com",
          },
        ],
      },
    });
  });
});

describe("PermissionsTab (users, org-scoped)", () => {
  it("grants the selected scope with the chosen organization_id", async () => {
    const create = vi.fn(() => Promise.resolve({ data: { id: "x" } }));
    renderUsersPermissionsTab(create);

    // Open the dialog.
    fireEvent.click(screen.getByRole("button", { name: /add permission/i }));

    // Pick the resource server (radix Select).
    fireEvent.click(await screen.findByText("Select a resource server"));
    fireEvent.click(await screen.findByText("Example API"));

    // Pick an organization first — changing it reloads and resets the
    // selection (faithful to the original), so it must precede scope choice.
    fireEvent.click(screen.getByText("No organization (tenant-wide)"));
    fireEvent.click(await screen.findByText("Org One"));

    // Now select a scope and submit.
    fireEvent.click(await screen.findByText("read:things"));
    fireEvent.click(
      await screen.findByRole("button", { name: /add 1 permission/i }),
    );

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith("users/u1/permissions", {
      data: {
        permissions: [
          {
            permission_name: "read:things",
            resource_server_identifier: "https://api.example.com",
            organization_id: "org1",
          },
        ],
      },
    });
  });
});
