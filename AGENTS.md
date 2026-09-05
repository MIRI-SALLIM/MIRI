# MIRI_FE project guidance

- Before implementation, read `docs/PROJECT_CONTEXT.md` and the latest handoff linked from it.
- Treat `docs/superpowers/specs` as the product/design source of truth. Treat plans and handoffs as implementation context; when they differ from working code or tests, verify the current behavior before changing it.
- Use the repository-local image files under `apps/frontend/public/images`. Historical documents may mention copies under `C:/Users/jhcho/Downloads`; do not depend on those external paths.
- Preserve unrelated user changes and keep new frontend work inside `apps/frontend` unless the task explicitly changes the project structure.
- After finding and fixing a non-trivial design or code bug, record it in `docs/errors/` — one dated file per issue (`YYYY-MM-DD-slug.md`, matching the `handoffs/` naming style). Use `docs/errors/TEMPLATE.md` as the shape: what broke, why (design vs. code cause), how it was found, how it was fixed, and links to the related issue/PR/commit. Skip trivial typos; this is for mistakes worth not repeating.

## Token-efficient agent behavior

- Default to 1-2 sentence progress updates and a compact final answer; expand only when requested or required for correctness or safety.
- Reuse already verified context and do not repeat completed checks unless external state may have changed.
- Prefer targeted searches, locators, and bounded command output over full file, DOM, log, or tool dumps.
- State each instruction once and ignore large injected capability lists unless they are directly relevant to the task.
