import { create } from "zustand";

import {
  fetchDeepInput,
  safeParseDeepInputV3,
  saveDeepInput,
  type DeepInputResponse,
  type DeepInputV3,
} from "@/entities/deep-input";
import { isApiErrorCode } from "@/shared/api";

export type DeepInputSyncState = "idle" | "saving" | "retrying" | "conflict" | "locked" | "rejected";

export const DEEP_INPUT_LOCAL_DEBOUNCE_MS = 350;
export const DEEP_INPUT_NETWORK_DEBOUNCE_MS = 1200;

export interface DeepInputBlockingIssue {
  code: string;
  path: string;
}

export type DeepInputUpdater = DeepInputV3 | ((draft: DeepInputV3) => DeepInputV3);

export interface DeepInputStore {
  baseRevision: number | null;
  blockingIssues: DeepInputBlockingIssue[];
  draft: DeepInputV3 | null;
  isHydrated: boolean;
  isReadOnly: boolean;
  sessionId: string | null;
  syncState: DeepInputSyncState;
  flush: () => Promise<void>;
  hydrate: (response: DeepInputResponse, options?: { isReadOnly?: boolean; sessionId?: string }) => void;
  reset: () => void;
  setBlockingIssues: (issues: DeepInputBlockingIssue[]) => void;
  setDraft: (nextDraft: DeepInputUpdater) => void;
  setReadOnly: (isReadOnly: boolean) => void;
  updateDraft: (updater: DeepInputUpdater) => void;
}

type Timer = ReturnType<typeof setTimeout>;

type InternalQueue = {
  baseline: DeepInputV3 | null;
  epoch: number;
  inFlight: Promise<void> | null;
  localCommitTimer: Timer | null;
  localCommittedDraft: DeepInputV3 | null;
  networkTimer: Timer | null;
  trailing: boolean;
};

const initialState: Pick<
  DeepInputStore,
  "baseRevision" | "blockingIssues" | "draft" | "isHydrated" | "isReadOnly" | "sessionId" | "syncState"
> = {
  baseRevision: null,
  blockingIssues: [],
  draft: null,
  isHydrated: false,
  isReadOnly: false,
  sessionId: null,
  syncState: "idle",
};

const queue: InternalQueue = {
  baseline: null,
  epoch: 0,
  inFlight: null,
  localCommitTimer: null,
  localCommittedDraft: null,
  networkTimer: null,
  trailing: false,
};

const clone = <T>(value: T): T => {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sameValue = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => sameValue(value, right[index]));
  }
  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
  }
  return false;
};

/**
 * Keep local edits while incorporating fields changed by the other participant.
 * Arrays are intentionally atomic because list additions/removals need to stay in
 * the same order the user edited them.
 */
const mergeLocalChanges = (base: unknown, local: unknown, remote: unknown): unknown => {
  if (sameValue(base, local)) return clone(remote);
  if (!isRecord(base) || !isRecord(local) || !isRecord(remote)) return clone(local);

  const merged: Record<string, unknown> = clone(remote);
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);

  for (const key of keys) {
    const hasBase = Object.hasOwn(base, key);
    const hasLocal = Object.hasOwn(local, key);
    const hasRemote = Object.hasOwn(remote, key);

    if (!hasLocal) {
      if (hasBase) delete merged[key];
      continue;
    }
    if (!hasBase) {
      merged[key] = clone(local[key]);
      continue;
    }
    if (!hasRemote) {
      merged[key] = clone(local[key]);
      continue;
    }

    merged[key] = mergeLocalChanges(base[key], local[key], remote[key]);
  }

  return merged;
};

const codePath = (code: string, input: DeepInputV3): string => {
  if (code === "UNKNOWN_EXPENSE_CATEGORY") {
    if (Object.keys(input.fixedExpenses ?? {}).some((key) => !["communication", "insurance", "subscriptions", "familySupport", "other"].includes(key))) {
      return "fixedExpenses";
    }
    return "variableExpenses";
  }
  if (code === "ITEMS_REQUIRE_KNOWN_COLLECTION") {
    return (input.assets?.length ?? 0) > 0 && input.assetsStatus !== "known" ? "assets" : "debts";
  }
  if (code === "DUPLICATE_ITEM_ID") {
    const assets = input.assets ?? [];
    const debts = input.debts ?? [];
    if (new Set(assets.map((item) => item.id)).size !== assets.length) return "assets";
    if (new Set(debts.map((item) => item.id)).size !== debts.length) return "debts";
  }
  if (code === "DUPLICATE_IMPORTANT_AREA") return "importantAreas";
  if (code === "DUPLICATE_SKIPPED_QUESTION" || code === "SKIPPED_QUESTION_HAS_ANSWER") return "skippedQuestionIds";
  if (code === "DUPLICATE_CONSTRAINT") return "constraints";
  if (code === "UNKNOWN_POST_SETTLEMENT_DEBT") return "afterSettlementMonthlyPayments";
  if (code === "UNKNOWN_CONTEXT_KEY") return "contextNotes";
  if (code === "FUNDING_ITEMS_REQUIRE_KNOWN_COLLECTION" || code === "DUPLICATE_FUNDING_ID") return "funding";
  if (code.startsWith("FUNDING_") || code.startsWith("SETTLEMENT_") || code.startsWith("ALLOCATION_") || code.startsWith("UNSAFE_FUNDING")) return "funding";
  return "$";
};

const readBlockingIssues = (input: DeepInputV3): DeepInputBlockingIssue[] => {
  const result = safeParseDeepInputV3(input);
  if (result.success) return [];

  return result.error.issues.map((issue) => {
    const code = issue.code === "custom" ? issue.message : issue.code;
    const path = issue.path.length > 0 ? issue.path.join(".") : codePath(code, input);
    return { code, path };
  });
};

const clearTimer = (timer: Timer | null): null => {
  if (timer !== null) globalThis.clearTimeout(timer);
  return null;
};

const createStore = (
  set: (partial: Partial<DeepInputStore> | ((state: DeepInputStore) => Partial<DeepInputStore>)) => void,
  get: () => DeepInputStore,
) => {
  const clearPendingTimers = () => {
    queue.localCommitTimer = clearTimer(queue.localCommitTimer);
    queue.networkTimer = clearTimer(queue.networkTimer);
  };

  const applyServerResponse = (
    response: DeepInputResponse,
    options: { preserveLocal: boolean; sessionId: string; epoch: number },
  ) => {
    const current = get();
    const parsedInput = response.input;
    const localDraft = current.draft;
    const shouldPreserve = options.preserveLocal && localDraft !== null && queue.baseline !== null;
    const nextDraft = shouldPreserve
      ? mergeLocalChanges(queue.baseline, localDraft, parsedInput) as DeepInputV3
      : clone(parsedInput);

    queue.baseline = clone(parsedInput);
    queue.localCommittedDraft = clone(nextDraft);
    set({
      baseRevision: response.revision,
      blockingIssues: readBlockingIssues(nextDraft),
      draft: nextDraft,
      isHydrated: true,
      isReadOnly: current.isReadOnly,
      sessionId: options.sessionId,
      syncState: "idle",
    });
    queue.trailing = !sameValue(nextDraft, parsedInput);
  };

  const handleSuccess = (snapshot: { epoch: number; input: DeepInputV3; sessionId: string }, response: DeepInputResponse) => {
    if (snapshot.epoch !== queue.epoch || get().sessionId !== snapshot.sessionId) return;
    const currentRevision = get().baseRevision;
    if (currentRevision !== null && currentRevision > response.revision) {
      set({ syncState: "idle" });
      return;
    }

    queue.baseline = clone(response.input);
    const currentDraft = get().draft;
    const hasTrailingDraft = currentDraft !== null && !sameValue(currentDraft, snapshot.input);
    set({
      baseRevision: response.revision,
      draft: hasTrailingDraft ? currentDraft : clone(response.input),
      syncState: "idle",
    });
    queue.trailing = hasTrailingDraft;
  };

  const handleFailure = async (
    snapshot: { epoch: number; input: DeepInputV3; sessionId: string },
    error: unknown,
  ) => {
    if (snapshot.epoch !== queue.epoch || get().sessionId !== snapshot.sessionId) return;

    if (isApiErrorCode(error, "REVISION_CONFLICT")) {
      set({ syncState: "retrying" });
      try {
        const latest = await fetchDeepInput(snapshot.sessionId);
        if (snapshot.epoch !== queue.epoch || get().sessionId !== snapshot.sessionId) return;
        applyServerResponse(latest, { epoch: snapshot.epoch, preserveLocal: true, sessionId: snapshot.sessionId });
        set((state) => ({ syncState: state.blockingIssues.length > 0 ? "idle" : "conflict" }));
      } catch {
        set({ syncState: "conflict" });
        queue.trailing = false;
      }
      return;
    }

    if (isApiErrorCode(error, "INPUT_LOCKED")) {
      clearPendingTimers();
      queue.trailing = false;
      set({ isReadOnly: true, syncState: "locked" });
      return;
    }

    set({ syncState: "rejected" });
  };

  const startSave = (): Promise<void> => {
    const current = get();
    if (
      current.sessionId === null ||
      current.draft === null ||
      current.baseRevision === null ||
      current.isReadOnly ||
      current.blockingIssues.length > 0 ||
      queue.baseline === null ||
      sameValue(current.draft, queue.baseline)
    ) {
      return Promise.resolve();
    }
    if (queue.inFlight !== null) {
      queue.trailing = true;
      return queue.inFlight;
    }

    const snapshot = {
      epoch: queue.epoch,
      input: clone(queue.localCommittedDraft ?? current.draft),
      sessionId: current.sessionId,
      revision: current.baseRevision,
    };
    set({ syncState: "saving" });

    const request = saveDeepInput(snapshot.sessionId, snapshot.revision, snapshot.input)
      .then((response) => handleSuccess(snapshot, response))
      .catch((error: unknown) => handleFailure(snapshot, error));
    const operation = request.finally(() => {
      if (queue.inFlight !== operation) return;
      queue.inFlight = null;
      if (queue.trailing && queue.networkTimer === null) {
        queue.trailing = false;
        void startSave();
      }
    });
    queue.inFlight = operation;
    return operation;
  };

  const scheduleSave = () => {
    queue.networkTimer = clearTimer(queue.networkTimer);
    queue.networkTimer = globalThis.setTimeout(() => {
      queue.networkTimer = null;
      void startSave();
    }, DEEP_INPUT_NETWORK_DEBOUNCE_MS);
  };

  const setDraft = (nextDraft: DeepInputUpdater) => {
    const current = get();
    if (current.isReadOnly || current.draft === null) return;
    const resolved = typeof nextDraft === "function" ? nextDraft(current.draft) : nextDraft;
    const draft = clone(resolved);
    queue.trailing = queue.inFlight !== null || !sameValue(draft, queue.baseline);
    set({
      blockingIssues: readBlockingIssues(draft),
      draft,
      syncState: current.syncState === "locked" ? "locked" : "idle",
    });

    queue.localCommitTimer = clearTimer(queue.localCommitTimer);
    queue.localCommitTimer = globalThis.setTimeout(() => {
      queue.localCommitTimer = null;
      const committed = get().draft;
      if (committed !== null) queue.localCommittedDraft = clone(committed);
    }, DEEP_INPUT_LOCAL_DEBOUNCE_MS);
    scheduleSave();
  };

  const flush = async (): Promise<void> => {
    queue.localCommitTimer = clearTimer(queue.localCommitTimer);
    queue.networkTimer = clearTimer(queue.networkTimer);
    const current = get();
    if (current.draft !== null) {
      queue.localCommittedDraft = clone(current.draft);
      queue.trailing = !sameValue(current.draft, queue.baseline);
    }
    if (queue.inFlight !== null) {
      queue.trailing = true;
    } else {
      await startSave();
    }

    // A conflict can finish one request, refetch, and immediately start its
    // trailing retry. Wait for that retry too so a blur/flush is a durable
    // boundary for callers (and for page navigation).
    while (queue.inFlight !== null) {
      const request = queue.inFlight;
      await request;
    }
  };

  const hydrate = (response: DeepInputResponse, options?: { isReadOnly?: boolean; sessionId?: string }) => {
    const sessionId = options?.sessionId ?? get().sessionId ?? "";
    const current = get();
    const isSameSession = current.sessionId !== null && current.sessionId === sessionId;
    if (!isSameSession) {
      queue.epoch += 1;
      clearPendingTimers();
      queue.trailing = false;
    }
    applyServerResponse(response, { epoch: queue.epoch, preserveLocal: isSameSession, sessionId });
    if (options?.isReadOnly !== undefined) {
      if (options.isReadOnly) {
        clearPendingTimers();
        queue.trailing = false;
      }
      set({ isReadOnly: options.isReadOnly, syncState: options.isReadOnly ? "locked" : "idle" });
    }
    if (isSameSession && queue.trailing && !get().isReadOnly) scheduleSave();
  };

  const reset = () => {
    queue.epoch += 1;
    clearPendingTimers();
    queue.baseline = null;
    queue.inFlight = null;
    queue.localCommittedDraft = null;
    queue.trailing = false;
    set(initialState);
  };

  const setBlockingIssues = (issues: DeepInputBlockingIssue[]) => {
    set({ blockingIssues: issues });
    if (issues.length === 0) scheduleSave();
  };

  const setReadOnly = (isReadOnly: boolean) => {
    if (isReadOnly) {
      clearPendingTimers();
      queue.trailing = false;
    }
    set({ isReadOnly, syncState: isReadOnly ? "locked" : "idle" });
  };

  return {
    ...initialState,
    flush,
    hydrate,
    reset,
    setBlockingIssues,
    setDraft,
    setReadOnly,
    updateDraft: setDraft,
  } satisfies DeepInputStore;
};

export const useDeepInputStore = create<DeepInputStore>((set, get) => createStore(set, get));

export const resetDeepInputStore = (): void => {
  useDeepInputStore.getState().reset();
};
