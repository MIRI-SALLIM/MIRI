import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeepInputV3 } from "@/entities/deep-input";
import { ApiError } from "@/shared/api";

import {
  resetDeepInputStore,
  useDeepInputStore,
} from "./deep-input-store";

const { fetchDeepInputMock, saveDeepInputMock } = vi.hoisted(() => ({
  fetchDeepInputMock: vi.fn(),
  saveDeepInputMock: vi.fn(),
}));

vi.mock("@/entities/deep-input", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/entities/deep-input")>();
  return {
    ...actual,
    fetchDeepInput: fetchDeepInputMock,
    saveDeepInput: saveDeepInputMock,
  };
});

const input = (): DeepInputV3 => ({
  inputVersion: "deep-input-v3",
  assetsStatus: "known",
  debtsStatus: "known",
  livingTogether: false,
  income: { bonusIncludedInMonthlyIncome: false },
});

const apiError = (code: string) => new ApiError({ status: 409, code, kind: "conflict" });

const response = (revision: number, nextInput = input()) => ({ input: nextInput, revision });

beforeEach(() => {
  vi.useFakeTimers();
  resetDeepInputStore();
  fetchDeepInputMock.mockReset();
  saveDeepInputMock.mockReset();
  saveDeepInputMock.mockResolvedValue(response(2));
  useDeepInputStore.getState().hydrate({ input: input(), revision: 1 }, { sessionId: "session-a" });
});

describe("useDeepInputStore", () => {
  it("waits 1200ms after a local edit before saving the complete document", async () => {
    const nextInput = input();
    nextInput.livingTogether = true;
    useDeepInputStore.getState().updateDraft(() => nextInput);

    await vi.advanceTimersByTimeAsync(1199);
    expect(saveDeepInputMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(saveDeepInputMock).toHaveBeenCalledWith("session-a", 1, nextInput);

    await vi.runOnlyPendingTimersAsync();
    expect(useDeepInputStore.getState().syncState).toBe("idle");
  });

  it("flushes the local debounce immediately on blur", async () => {
    const nextInput = input();
    nextInput.livingTogether = true;
    useDeepInputStore.getState().updateDraft(() => nextInput);

    await useDeepInputStore.getState().flush();

    expect(saveDeepInputMock).toHaveBeenCalledWith("session-a", 1, nextInput);
  });

  it("keeps one patch in flight and sends one trailing merged snapshot", async () => {
    let resolveFirst: ((value: ReturnType<typeof response>) => void) | undefined;
    saveDeepInputMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );

    const firstInput = input();
    firstInput.livingTogether = true;
    useDeepInputStore.getState().updateDraft(() => firstInput);
    await vi.advanceTimersByTimeAsync(1200);
    expect(saveDeepInputMock).toHaveBeenCalledTimes(1);

    const trailingInput = input();
    trailingInput.livingTogether = true;
    trailingInput.income = { bonusIncludedInMonthlyIncome: true };
    useDeepInputStore.getState().updateDraft(() => trailingInput);
    await vi.advanceTimersByTimeAsync(1200);
    expect(saveDeepInputMock).toHaveBeenCalledTimes(1);

    resolveFirst?.(response(2, firstInput));
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(1200);

    expect(saveDeepInputMock).toHaveBeenCalledTimes(2);
    expect(saveDeepInputMock).toHaveBeenLastCalledWith("session-a", 2, trailingInput);
  });

  it("does not let an older patch response overwrite a newer hydrated revision", async () => {
    let resolveSave: ((value: ReturnType<typeof response>) => void) | undefined;
    saveDeepInputMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveSave = resolve; }),
    );

    const localInput = input();
    localInput.livingTogether = true;
    useDeepInputStore.getState().updateDraft(() => localInput);
    await vi.advanceTimersByTimeAsync(1200);

    const latestInput = input();
    latestInput.income = { bonusIncludedInMonthlyIncome: true };
    useDeepInputStore.getState().hydrate(response(3, latestInput), { sessionId: "session-a" });
    resolveSave?.(response(2, localInput));
    await vi.runOnlyPendingTimersAsync();

    expect(useDeepInputStore.getState().baseRevision).toBe(3);
    expect(useDeepInputStore.getState().draft).toEqual({ ...latestInput, livingTogether: true });
  });

  it("holds a patch while the local mirror reports blocking issues", async () => {
    const invalidInput = input();
    invalidInput.fixedExpenses = { unexpected: { status: "known", value: 1, precision: "exact" } };
    useDeepInputStore.getState().updateDraft(() => invalidInput);

    await vi.advanceTimersByTimeAsync(1200);

    expect(saveDeepInputMock).not.toHaveBeenCalled();
    expect(useDeepInputStore.getState().blockingIssues).toEqual([
      { code: "UNKNOWN_EXPENSE_CATEGORY", path: "fixedExpenses" },
    ]);

    const repairedInput = input();
    repairedInput.livingTogether = true;
    useDeepInputStore.getState().updateDraft(() => repairedInput);
    await vi.advanceTimersByTimeAsync(1200);

    expect(saveDeepInputMock).toHaveBeenCalledWith("session-a", 1, repairedInput);
  });

  it("keeps the funding key in the complete document while editing core fields", async () => {
    const withFunding = input();
    withFunding.funding = {
      sourcesStatus: "unknown",
      settlementsStatus: "unknown",
      sources: [],
      settlements: [],
    };
    useDeepInputStore.getState().hydrate({ input: withFunding, revision: 1 }, { sessionId: "session-a" });

    useDeepInputStore.getState().updateDraft((draft) => ({ ...draft, livingTogether: true }));
    await useDeepInputStore.getState().flush();

    expect(saveDeepInputMock).toHaveBeenCalledWith(
      "session-a",
      1,
      expect.objectContaining({ funding: withFunding.funding }),
    );
  });

  it("refetches and merges local changes after a REVISION_CONFLICT", async () => {
    const localInput = input();
    localInput.livingTogether = true;
    const remoteInput = input();
    remoteInput.income = { bonusIncludedInMonthlyIncome: true };
    const mergedInput = { ...remoteInput, livingTogether: true };
    saveDeepInputMock.mockRejectedValueOnce(apiError("REVISION_CONFLICT"));
    fetchDeepInputMock.mockResolvedValue(response(2, remoteInput));
    saveDeepInputMock.mockResolvedValueOnce(response(3, mergedInput));

    useDeepInputStore.getState().updateDraft(() => localInput);
    await vi.advanceTimersByTimeAsync(1200);
    await vi.runOnlyPendingTimersAsync();

    expect(fetchDeepInputMock).toHaveBeenCalledWith("session-a");
    expect(useDeepInputStore.getState().draft).toEqual(mergedInput);
    expect(useDeepInputStore.getState().baseRevision).toBe(3);
    expect(saveDeepInputMock).toHaveBeenLastCalledWith("session-a", 2, mergedInput);
  });

  it("switches to read-only when the server reports INPUT_LOCKED", async () => {
    saveDeepInputMock.mockRejectedValueOnce(apiError("INPUT_LOCKED"));
    const nextInput = input();
    nextInput.livingTogether = true;
    useDeepInputStore.getState().updateDraft(() => nextInput);

    await vi.advanceTimersByTimeAsync(1200);
    await vi.runOnlyPendingTimersAsync();

    expect(useDeepInputStore.getState().isReadOnly).toBe(true);
    expect(useDeepInputStore.getState().syncState).toBe("locked");
  });

  it("hydrates from the server without writing answers to web storage", () => {
    expect(useDeepInputStore.getState().isHydrated).toBe(true);
    expect(useDeepInputStore.getState().baseRevision).toBe(1);
    expect(useDeepInputStore.getState().draft).toEqual(input());
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
