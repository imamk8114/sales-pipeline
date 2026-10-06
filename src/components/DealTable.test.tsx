import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as PipelineStore from "../store/pipelineStore";
import type { DealTable as DealTableComponent } from "./DealTable";

async function freshDealTable(): Promise<{
  DealTable: typeof DealTableComponent;
  store: typeof PipelineStore;
}> {
  vi.resetModules();
  const store = await import("../store/pipelineStore");
  const { DealTable } = await import("./DealTable");
  return { DealTable, store };
}

afterEach(() => {
  cleanup();
});

// Note on scope: @tanstack/react-virtual needs real element dimensions to
// decide which rows to mount, and jsdom reports every element as 0x0 — so
// under jsdom the virtualized row list itself always mounts zero rows
// (confirmed: footer still correctly says "50,000 deals shown", only the
// virtualized body is empty). Individual row rendering/interaction is
// already covered in DealRow.test.tsx; these tests cover what jsdom *can*
// exercise here: the header (not virtualized) and its select-all checkbox.

describe("DealTable: header", () => {
  it("renders all column labels", async () => {
    const { DealTable } = await freshDealTable();
    render(<DealTable />);
    // Exact match: none of these sort fields is the default ("stageAge", which
    // has no corresponding column), so no header shows an arrow suffix here —
    // and exact match avoids a known RTL gotcha where a loose substring match
    // also catches the header row's own concatenated textContent as a "hit".
    for (const label of ["Deal", "Owner", "Value", "Licences", "Stage", "Created", "Last activity", "Save"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("clicking a sortable column header changes the store's sort field", async () => {
    const { DealTable, store } = await freshDealTable();
    render(<DealTable />);
    fireEvent.click(screen.getByText("Value"));
    expect(store.getSort().field).toBe("amount");
  });

  it("footer reports the total shown, matching the store", async () => {
    const { DealTable, store } = await freshDealTable();
    render(<DealTable />);
    expect(screen.getByText(`${store.getFilteredIds().length.toLocaleString()} deals shown`)).toBeInTheDocument();
  });
});

describe("DealTable: header select-all checkbox", () => {
  it("starts unchecked, not indeterminate, when nothing is selected", async () => {
    const { DealTable } = await freshDealTable();
    render(<DealTable />);
    const checkbox = screen.getByRole("checkbox", { name: "Select all shown deals" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.indeterminate).toBe(false);
  });

  it("clicking it selects every currently filtered deal, in one click", async () => {
    const { DealTable, store } = await freshDealTable();
    store.setFilters({ stage: "Contacted" }); // narrow the view first, like the real workflow
    const expectedCount = store.getFilteredIds().length;
    expect(expectedCount).toBeGreaterThan(0);

    render(<DealTable />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all shown deals" }));

    expect(store.getSelection().size).toBe(expectedCount);
  });

  it("shows indeterminate when only some (not all) filtered deals are selected", async () => {
    const { DealTable, store } = await freshDealTable();
    const ids = store.getFilteredIds();
    store.toggleSelect(ids[0]); // select just one of 50,000

    render(<DealTable />);
    const checkbox = screen.getByRole("checkbox", { name: "Select all shown deals" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(checkbox.indeterminate).toBe(true);
  });

  it("shows checked (and the deselect label) once everything shown is selected", async () => {
    const { DealTable, store } = await freshDealTable();
    store.selectAllFiltered();

    render(<DealTable />);
    const checkbox = screen.getByRole("checkbox", { name: "Deselect all shown deals" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(checkbox.indeterminate).toBe(false);
  });

  it("clicking it again when everything is selected clears the selection", async () => {
    const { DealTable, store } = await freshDealTable();
    store.selectAllFiltered();

    render(<DealTable />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Deselect all shown deals" }));

    expect(store.getSelection().size).toBe(0);
  });
});
