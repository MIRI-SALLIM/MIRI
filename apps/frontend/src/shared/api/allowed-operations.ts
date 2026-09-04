import type { paths } from "./schema";

type AllowedMethod = "get" | "post" | "patch";

export const allowedOperations = [
  { method: "post", path: "/api/v1/sessions" },
  { method: "get", path: "/api/v1/me/session" },
  { method: "get", path: "/api/v1/light/questions" },
  { method: "get", path: "/api/v1/invitations/{code}" },
  { method: "post", path: "/api/v1/invitations/{code}/join" },
  { method: "get", path: "/api/v1/sessions/{session_id}/me/input" },
  { method: "patch", path: "/api/v1/sessions/{session_id}/me/input" },
  { method: "post", path: "/api/v1/sessions/{session_id}/me/submit" },
  { method: "post", path: "/api/v1/sessions/{session_id}/nudge" },
  { method: "get", path: "/api/v1/sessions/{session_id}/result" },
  { method: "get", path: "/api/v1/sessions/{session_id}/status" },
] as const satisfies ReadonlyArray<{ method: AllowedMethod; path: string }>;

export type AllowedOperation = (typeof allowedOperations)[number];
export type AllowedPath = AllowedOperation["path"];

type AllowedMethodForPath<Path extends AllowedPath> = Extract<AllowedOperation, { path: Path }>["method"] &
  keyof paths[Path];

export type AllowedPaths = {
  [Path in AllowedPath]: Pick<paths[Path], AllowedMethodForPath<Path>>;
};
