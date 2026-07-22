import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SelectionList, type SelectionListItem } from "./SelectionList";

const items: SelectionListItem[] = Array.from({ length: 7 }, (_, i) => ({
  key: `k${i}`,
  primary: `Item ${i}`,
  secondary: i === 0 ? "first" : undefined,
  searchText: `Item ${i} ${i === 0 ? "alpha" : "beta"}`,
}));

describe("SelectionList", () => {
  it("shows the search box only past the threshold", () => {
    const { rerender } = render(
      <SelectionList
        items={items.slice(0, 5)}
        selected={new Set()}
        onToggle={() => {}}
        emptyMessage="none"
        searchPlaceholder="Search things"
      />,
    );
    expect(screen.queryByPlaceholderText("Search things")).toBeNull();

    rerender(
      <SelectionList
        items={items}
        selected={new Set()}
        onToggle={() => {}}
        emptyMessage="none"
        searchPlaceholder="Search things"
      />,
    );
    expect(screen.getByPlaceholderText("Search things")).toBeTruthy();
  });

  it("filters items client-side by searchText and shows no-match", () => {
    render(
      <SelectionList
        items={items}
        selected={new Set()}
        onToggle={() => {}}
        emptyMessage="none"
        searchPlaceholder="Search things"
      />,
    );
    // "alpha" is only on Item 0.
    fireEvent.change(screen.getByPlaceholderText("Search things"), {
      target: { value: "alpha" },
    });
    expect(screen.getByText("Item 0")).toBeTruthy();
    expect(screen.queryByText("Item 3")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Search things"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText("No matches")).toBeTruthy();
  });

  it("renders secondary only when present", () => {
    render(
      <SelectionList
        items={items}
        selected={new Set()}
        onToggle={() => {}}
        emptyMessage="none"
      />,
    );
    expect(screen.getByText("first")).toBeTruthy();
  });

  it("toggles the item key on checkbox click", () => {
    const onToggle = vi.fn();
    render(
      <SelectionList
        items={items}
        selected={new Set(["k1"])}
        onToggle={onToggle}
        emptyMessage="none"
        idPrefix="test"
      />,
    );
    fireEvent.click(screen.getByLabelText("Item 2"));
    expect(onToggle).toHaveBeenCalledWith("k2");
  });

  it("shows the empty message when there are no items and not loading", () => {
    render(
      <SelectionList
        items={[]}
        selected={new Set()}
        onToggle={() => {}}
        emptyMessage="nothing here"
      />,
    );
    expect(screen.getByText("nothing here")).toBeTruthy();
  });

  it("shows loading over the empty message", () => {
    render(
      <SelectionList
        items={[]}
        selected={new Set()}
        onToggle={() => {}}
        loading
        emptyMessage="nothing here"
      />,
    );
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByText("nothing here")).toBeNull();
  });
});
