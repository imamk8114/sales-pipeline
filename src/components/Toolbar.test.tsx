import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as PipelineStore from "../store/pipelineStore";
import type { Toolbar as ToolbarComponent } from "./Toolbar";

async function freshToolbar(): Promise<{
  Toolbar: typeof ToolbarComponent;
  store: typeof PipelineStore;
}> {
  vi.resetModules();
  const store = await import("../store/pipelineStore");
  const { Toolbar } = await import("./Toolbar");
  return { Toolbar, store };
}

function renderToolbar(Toolbar: typeof ToolbarComponent, onSearchFocusChange = vi.fn()) {
  const searchRef = createRef<HTMLInputElement>();
  return { ...render(<Toolbar searchRef={searchRef} onSearchFocusChange={onSearchFocusChange} />), onSearchFocusChange };
}

afterEach(() => {
  cleanup();
});

describe("Toolbar: filters", () => {
  it("shows the total/shown count for the unfiltered view", async () => {
    const { Toolbar, store } = await freshToolbar();
    renderToolbar(Toolbar);
    expect(screen.getByText(`${store.getTotalCount().toLocaleString()} / ${store.getTotalCount().toLocaleString()} shown`)).toBeInTheDocument();
  });

  it("typing in search narrows the store's filtered view", async () => {
    const { Toolbar, store } = await freshToolbar();
    const target = store.getDeal(store.getFilteredIds()[0])!;
    const needle = target.company.slice(0, 6);
    const user = userEvent.setup();

    renderToolbar(Toolbar);
    await user.type(screen.getByPlaceholderText("Search company…"), needle);

    expect(store.getFilters().search).toBe(needle);
    for (const id of store.getFilteredIds()) {
      expect(store.getDeal(id)!.company.toLowerCase()).toContain(needle.toLowerCase());
    }
  });

  it("calls onSearchFocusChange when the search input is focused and blurred", async () => {
    const { Toolbar } = await freshToolbar();
    const user = userEvent.setup();
    const { onSearchFocusChange } = renderToolbar(Toolbar);

    const input = screen.getByPlaceholderText("Search company…");
    await user.click(input);
    expect(onSearchFocusChange).toHaveBeenCalledWith(true);

    await user.tab();
    expect(onSearchFocusChange).toHaveBeenCalledWith(false);
  });

  it("picking a stage in the dropdown filters the store to that stage", async () => {
    const { Toolbar, store } = await freshToolbar();
    const user = userEvent.setup();
    renderToolbar(Toolbar);

    await user.selectOptions(screen.getByDisplayValue("All stages"), "Negotiation");

    expect(store.getFilters().stage).toBe("Negotiation");
    for (const id of store.getFilteredIds()) expect(store.getDeal(id)!.stage).toBe("Negotiation");
  });

  it("picking an owner in the dropdown filters the store to that owner", async () => {
    const { Toolbar, store } = await freshToolbar();
    const user = userEvent.setup();
    const owner = store.OWNERS_FOR_FILTER[0];
    renderToolbar(Toolbar);

    await user.selectOptions(screen.getByDisplayValue("All owners"), owner);

    expect(store.getFilters().owner).toBe(owner);
  });

  it("picking a sort option updates the store's sort field", async () => {
    const { Toolbar, store } = await freshToolbar();
    const user = userEvent.setup();
    renderToolbar(Toolbar);

    await user.selectOptions(screen.getByDisplayValue("Longest in stage"), "Highest value");

    expect(store.getSort().field).toBe("amount");
  });
});

describe("Toolbar: activity panel", () => {
  it("is hidden by default and toggles open on click", async () => {
    const { Toolbar } = await freshToolbar();
    const user = userEvent.setup();
    renderToolbar(Toolbar);

    expect(screen.queryByText("No activity yet.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Activity/ }));
    expect(screen.getByText("No activity yet.")).toBeInTheDocument();
  });

  it("lists a logged move after a bulk action", async () => {
    const { Toolbar, store } = await freshToolbar();
    const id = store.getFilteredIds().find((i) => store.getDeal(i)!.stage !== "Won")!;
    store.moveDeals([id], "Won");
    const user = userEvent.setup();

    renderToolbar(Toolbar);
    await user.click(screen.getByRole("button", { name: /^Activity/ }));

    expect(screen.getByText(/Moved 1 deal → Won/)).toBeInTheDocument();
  });
});

describe("Toolbar: bulk selection bar", () => {
  it("is hidden when nothing is selected", async () => {
    const { Toolbar } = await freshToolbar();
    renderToolbar(Toolbar);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("appears once something is selected and shows the count", async () => {
    const { Toolbar, store } = await freshToolbar();
    store.toggleSelect(store.getFilteredIds()[0]);
    const { container } = renderToolbar(Toolbar);
    expect(container.querySelector(".bulk-bar strong")).toHaveTextContent("1");
    expect(screen.getByText("selected")).toBeInTheDocument();
  });

  it("clicking a stage button moves every selected deal to that stage", async () => {
    const { Toolbar, store } = await freshToolbar();
    const ids = store.getFilteredIds().slice(0, 3);
    for (const id of ids) store.toggleSelect(id);
    const user = userEvent.setup();

    renderToolbar(Toolbar);
    await user.click(screen.getByRole("button", { name: /^Won/ }));

    for (const id of ids) expect(store.getDeal(id)!.stage).toBe("Won");
  });

  it('"Select all N shown" selects every currently filtered deal', async () => {
    const { Toolbar, store } = await freshToolbar();
    store.setFilters({ stage: "Won" });
    store.toggleSelect(store.getFilteredIds()[0]); // reveal the bulk bar
    const allWonCount = store.getFilteredIds().length;
    const user = userEvent.setup();

    renderToolbar(Toolbar);
    await user.click(screen.getByRole("button", { name: /Select all/ }));

    expect(store.getSelection().size).toBe(allWonCount);
  });

  it('"Clear" empties the selection', async () => {
    const { Toolbar, store } = await freshToolbar();
    store.toggleSelect(store.getFilteredIds()[0]);
    const user = userEvent.setup();

    renderToolbar(Toolbar);
    await user.click(screen.getByRole("button", { name: /Clear/ }));

    expect(store.getSelection().size).toBe(0);
  });
});

describe("Toolbar: failed-only view", () => {
  it("shows the failed-deals bar with a retry-all action when filters.failedOnly is set", async () => {
    const { Toolbar, store } = await freshToolbar();
    const fakeApi = await import("../api/fakeApi");
    vi.useFakeTimers();
    fakeApi.setApiConfig({ minLatencyMs: 0, maxLatencyMs: 0, failRate: 1 });

    const id = store.getFilteredIds()[0];
    store.moveDeals([id], "Won");
    await vi.advanceTimersByTimeAsync(400 + 800 + 10);
    store.viewFailedDeals();

    renderToolbar(Toolbar);
    expect(screen.getByText(/that failed to save/)).toBeInTheDocument();
    const retryAllBtn = screen.getByRole("button", { name: /Retry all 1/ });

    fakeApi.setApiConfig({ failRate: 0 });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.click(retryAllBtn);
    await vi.advanceTimersByTimeAsync(10);

    expect(store.getDeal(id)!.syncStatus).toBe("idle");
    vi.useRealTimers();
  });

  it('"Exit" clears the failedOnly filter', async () => {
    const { Toolbar, store } = await freshToolbar();
    store.setFilters({ failedOnly: true });
    const user = userEvent.setup();

    renderToolbar(Toolbar);
    await user.click(screen.getByRole("button", { name: /Exit/ }));

    expect(store.getFilters().failedOnly).toBe(false);
  });
});
