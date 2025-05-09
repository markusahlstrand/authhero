import { fireEvent, render, screen } from "@testing-library/react";
import { test, vi } from "vitest";
import { App } from "./App";

test.skip("should pass", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  render(<App tenantId="test" />);

  // Open the first post
  fireEvent.click(await screen.findByText("Post 1"));
  fireEvent.click(await screen.findByText("Edit"));
  await screen.findByDisplayValue("Post 1");
  // Ensure the form is fully loaded before interacting with it
  await new Promise((resolve) => setTimeout(resolve, 1000));
  // Update its title
  fireEvent.change(await screen.findByDisplayValue("Post 1"), {
    target: { value: "Post 1 edited" },
  });
  fireEvent.click(await screen.findByText("Save"));
  await screen.findByText("Post 1 edited");

  // Navigate to the comments
  fireEvent.click(await screen.findByText("Comments"));
  // Open the first comment
  fireEvent.click(await screen.findByText("Comment 1"));
  fireEvent.click(await screen.findByText("Edit"));
  await screen.findByDisplayValue("Post 1 edited");
  // Ensure the form is fully loaded before interacting with it
  await new Promise((resolve) => setTimeout(resolve, 1000));
  // Edit the comment selected post
  fireEvent.click(await screen.findByDisplayValue("Post 1 edited"));
  fireEvent.click(await screen.findByText("Post 11"));
  fireEvent.click(await screen.findByText("Save"));
  // Check the comment has been updated by finding the post link in the comments list page
  await screen.findByText("Post 11", { selector: "a *" });
}, 10000);
