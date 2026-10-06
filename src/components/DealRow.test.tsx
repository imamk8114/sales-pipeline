import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as PipelineStore from "../store/pipelineStore";
import type { DealRow as DealRowComponent } from "./DealRow";

// Same isolation technique as the store's own tests: pipelineStore is a
// singleton (one shared 50k-deal pipeline), so each test needs a fresh
// module instance. The component is re-imported from the same fresh
// instance so it wires up to the same store the test asserts against.
async function freshDealRow(): Promise<{
  DealRow: typeof DealRowComponent;
  store: typeof PipelineStore;
}> {
  vi.resetModules();
  const store = await import("../store/pipelineStore");
  const { DealRow } = await import("./DealRow");
  return { DealRow, store };
}

afterEach(() => {
  cleanup();
});

describe("DealRow", () => {
  it("renders the deal's company, id, owner, value, licences, stage, and created date", async () => {
    const { DealRow, store } = await freshDealRow();
    const id = store.getFilteredIds()[0];
    const deal = store.getDeal(id)!;

    render(<DealRow id={id} top={0} height={52} isSelected={false} isActive={false} />);

    expect(screen.getByText(deal.company)).toBeInTheDocument();
    expect(screen.getByText(`#${id.replace("deal-", "")}`)).toBeInTheDocument();
    expect(screen.getByText(deal.owner)).toBeInTheDocument();
    expect(screen.getByText(deal.owner.charAt(0))).toBeInTheDocument(); // avatar initial
    expect(screen.getByText(String(deal.licences))).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue(deal.stage);
  });

  it("shows a plain dash in the status column for an idle, untouched deal", async () => {
    const { DealRow, store } = await freshDealRow();
    const id = store.getFilteredIds().find((i) => store.getDeal(i)!.syncStatus === "idle")!;

    render(<DealRow id={id} top={0} height={52} isSelected={false} isActive={false} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("clicking the row toggles its selection in the store", async () => {
    const { DealRow, store } = await freshDealRow();
    const id = store.getFilteredIds()[0];
    const user = userEvent.setup();

    render(<DealRow id={id} top={0} height={52} isSelected={false} isActive={false} />);
    expect(store.getSelection().has(id)).toBe(false);

    await user.click(screen.getByTitle(store.getDeal(id)!.company));
    expect(store.getSelection().has(id)).toBe(true);
    expect(store.getActiveId()).toBe(id);
  });

  it("clicking the row checkbox also toggles selection (not just the row body)", async () => {
    const { DealRow, store } = await freshDealRow();
    const id = store.getFilteredIds()[0];
    const user = userEvent.setup();

    render(<DealRow id={id} top={0} height={52} isSelected={false} isActive={false} />);
    await user.click(screen.getByRole("checkbox"));
    expect(store.getSelection().has(id)).toBe(true);
  });

  it("shift-clicking selects a range anchored at the previously active row", async () => {
    const { DealRow, store } = await freshDealRow();
    const ids = store.getFilteredIds();
    store.toggleSelect(ids[2]); // sets the anchor

    render(<DealRow id={ids[5]} top={0} height={52} isSelected={false} isActive={false} />);
    fireEvent.click(screen.getByTitle(store.getDeal(ids[5])!.company), { shiftKey: true });

    for (const id of ids.slice(2, 6)) expect(store.getSelection().has(id)).toBe(true);
  });

  it("changing the stage select moves the deal", async () => {
    const { DealRow, store } = await freshDealRow();
    const id = store.getFilteredIds().find((i) => store.getDeal(i)!.stage !== "Won")!;
    const user = userEvent.setup();

    render(<DealRow id={id} top={0} height={52} isSelected={false} isActive={false} />);
    await user.selectOptions(screen.getByRole("combobox"), "Won");

    expect(store.getDeal(id)!.stage).toBe("Won");
    expect(store.getDeal(id)!.syncStatus).toBe("saving");
  });

  it("clicking the stage select does not also toggle row selection", async () => {
    const { DealRow, store } = await freshDealRow();
    const id = store.getFilteredIds()[0];
    const user = userEvent.setup();

    render(<DealRow id={id} top={0} height={52} isSelected={false} isActive={false} />);
    await user.click(screen.getByRole("combobox"));

    expect(store.getSelection().has(id)).toBe(false);
  });

  it("shows a retry button with the error message when the save failed, and retrying re-queues it", async () => {
    const { DealRow, store } = await freshDealRow();
    const fakeApi = await import("../api/fakeApi");
    vi.useFakeTimers();
    fakeApi.setApiConfig({ minLatencyMs: 0, maxLatencyMs: 0, failRate: 1 });

    const id = store.getFilteredIds()[0];
    store.moveDeals([id], "Won");
    await vi.advanceTimersByTimeAsync(400 + 800 + 10);
    expect(store.getDeal(id)!.syncStatus).toBe("error");

    render(<DealRow id={id} top={0} height={52} isSelected={false} isActive={false} />);
    const retryBtn = screen.getByRole("button", { name: /retry/i });
    expect(retryBtn).toHaveAttribute("title", store.getDeal(id)!.lastError);

    fakeApi.setApiConfig({ failRate: 0 });
    fireEvent.click(retryBtn);
    expect(store.getDeal(id)!.syncStatus).toBe("saving");

    await vi.advanceTimersByTimeAsync(10);
    expect(store.getDeal(id)!.syncStatus).toBe("idle");

    vi.useRealTimers();
  });

  it("shows a saving indicator while a save is in flight", async () => {
    const { DealRow, store } = await freshDealRow();
    const fakeApi = await import("../api/fakeApi");
    vi.useFakeTimers();
    fakeApi.setApiConfig({ minLatencyMs: 10_000, maxLatencyMs: 10_000, failRate: 0 });

    const id = store.getFilteredIds().find((i) => store.getDeal(i)!.stage !== "Won")!;
    store.moveDeals([id], "Won");

    render(<DealRow id={id} top={0} height={52} isSelected={false} isActive={false} />);
    expect(screen.getByTitle("Saving…")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("applies the selected/active CSS classes from props", async () => {
    const { DealRow, store } = await freshDealRow();
    const id = store.getFilteredIds()[0];

    const { container } = render(<DealRow id={id} top={0} height={52} isSelected={true} isActive={true} />);
    const row = container.querySelector(".row")!;
    expect(row.className).toContain("row--selected");
    expect(row.className).toContain("row--active");
  });

  it("renders nothing if the deal id doesn't exist in the store", async () => {
    const { DealRow } = await freshDealRow();
    const { container } = render(<DealRow id="not-a-real-id" top={0} height={52} isSelected={false} isActive={false} />);
    expect(container.firstChild).toBeNull();
  });
});
