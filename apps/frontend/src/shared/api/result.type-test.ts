import type { components } from "./schema";

type SessionResult =
  | components["schemas"]["ResultWaitingResponse"]
  | components["schemas"]["ResultReadyResponse"];

declare const result: SessionResult;

if (result.status === "waiting") {
  // @ts-expect-error Waiting results must not expose the partner comparison payload.
  void result.result;
}

if (result.status === "ready") {
  void result.result;
}
