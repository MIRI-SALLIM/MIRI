# 미리살림 F7 개인정보 제한 공유 카드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** F6의 준비 완료 결과를 개인정보가 제한된 9:16·1:1 공유 카드로 변환하고, 브라우저에서 정확한 크기의 PNG로 저장한다.

**Architecture:** `LightComparisonResultData` 전체를 UI에 직접 전달하지 않고 `toShareCardModel()`이 여섯 개 공개 필드만 남긴다. `ShareCard`는 이 제한 모델만 소비하고, `DownloadShareCardButton`은 렌더 노드와 비율별 고정 치수를 사용해 PNG를 만든다. `SharePage`는 직접 URL 접근도 지원하기 위해 F6의 결과 쿼리를 재사용하며 waiting 응답이면 대기 화면으로 되돌린다.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 4, TanStack Query 5, html-to-image, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-05-mirisallim-light-vertical-slice-design.md`

## Agent Execution Policy

- Implementer for every task: `gpt-5.6-luna` with `xhigh` reasoning effort.
- Task reviewer, scoped re-reviewer, and final whole-branch reviewer: `gpt-5.6-sol` with `high` reasoning effort.
- The current primary `gpt-5.6-sol` agent is the supervisor. It owns planning, dispatch, review adjudication, progress ledger, and verification, but does not write implementation code.
- Implementation tasks run sequentially. A later task starts only after the Sol reviewer approves the preceding task or the supervisor completes the documented fix loop.

## Global Constraints

- 수정 범위는 `apps/frontend/**`와 이 계획 문서에 한정한다.
- 서버 DTO는 `src/shared/api/schema.d.ts`에서 파생하며 수동으로 중복 선언하지 않는다.
- `ShareCardModel`의 키는 `leftType`, `rightType`, `tagline`, `mutualHitCount`, `questionCount`, `ratio` 여섯 개뿐이다.
- 카드 모델과 카드 DOM에는 금액, 소득, 부채, 저축액 및 원본 답변 배열을 넣지 않는다.
- 결과·답변·예측을 `localStorage` 또는 `sessionStorage`에 저장하지 않는다.
- 점수 분모는 `questionCount`를 사용하며 숫자 5를 하드코딩하지 않는다.
- 9:16 출력은 1080×1920px, 1:1 출력은 1080×1080px이다.
- Green `#43A77B`, Purple `#8A6FD1`, 배경 `#FCFCFB`, border 기반 카드와 기존 focus-visible 정책을 유지한다.
- 카드에는 미확정 공개 도메인을 임의로 넣지 않고 서비스명 `미리살림`을 표시한다.

---

### Task 1: 제한된 공유 모델과 프라이버시 매퍼

**Files:**
- Create: `apps/frontend/src/entities/share-card/model/types.ts`
- Create: `apps/frontend/src/entities/share-card/index.ts`
- Create: `apps/frontend/src/features/download-share-card/lib/to-share-card-model.ts`
- Create: `apps/frontend/src/features/download-share-card/lib/to-share-card-model.test.ts`
- Create: `apps/frontend/src/features/download-share-card/index.ts`

**Interfaces:**
- Consumes: `LightResult` from `@/entities/light-result`.
- Produces: `ShareCardRatio`, `ShareCardModel`, `SHARE_CARD_RENDER_SIZE`, `SHARE_CARD_OUTPUT_SIZE`, `SHARE_CARD_PIXEL_RATIO`, `toShareCardModel(result, ratio)`.

- [ ] **Step 1: Write the failing privacy test**

```ts
const model = toShareCardModel(readyResult.result, "square");

expect(Object.keys(model).sort()).toEqual([
  "leftType",
  "mutualHitCount",
  "questionCount",
  "ratio",
  "rightType",
  "tagline",
]);
expect(JSON.stringify(model)).not.toMatch(
  /amount|income|debt|saving|금액|소득|부채|저축액|answers|guesses/i,
);
expect(model).toEqual({
  leftType: readyResult.result.myType.typeName,
  mutualHitCount: 4,
  questionCount: 7,
  ratio: "square",
  rightType: readyResult.result.partnerType.typeName,
  tagline: readyResult.result.tagline,
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm.cmd --workspace @mirisallim/frontend run test -- --run src/features/download-share-card/lib/to-share-card-model.test.ts`

Expected: FAIL because the share-card entity and mapper do not exist.

- [ ] **Step 3: Implement the exact public model**

```ts
export type ShareCardRatio = "portrait" | "square";

export interface ShareCardModel {
  leftType: string;
  rightType: string;
  tagline: string;
  mutualHitCount: number;
  questionCount: number;
  ratio: ShareCardRatio;
}

export const SHARE_CARD_OUTPUT_SIZE = {
  portrait: { height: 1920, width: 1080 },
  square: { height: 1080, width: 1080 },
} as const;

export const SHARE_CARD_RENDER_SIZE = {
  portrait: { height: 960, width: 540 },
  square: { height: 540, width: 540 },
} as const;

export const SHARE_CARD_PIXEL_RATIO = 2;
```

`toShareCardModel()`은 `myType.typeName`, `partnerType.typeName`, `tagline`, `mutualHitCount`, `questionCount`, `ratio`만 새 객체로 복사한다. 원본 결과의 나머지 속성을 spread하지 않는다.

- [ ] **Step 4: Run the focused test and typecheck**

Run:

```text
npm.cmd --workspace @mirisallim/frontend run test -- --run src/features/download-share-card/lib/to-share-card-model.test.ts
npm.cmd --workspace @mirisallim/frontend run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit the task**

```text
git add apps/frontend/src/entities/share-card apps/frontend/src/features/download-share-card
git commit -m "feat(web): restrict share card result model"
```

---

### Task 2: 9:16·1:1 ShareCard 렌더링

**Files:**
- Create: `apps/frontend/src/widgets/share-card/ui/ShareCard.tsx`
- Create: `apps/frontend/src/widgets/share-card/ui/ShareCard.test.tsx`
- Create: `apps/frontend/src/widgets/share-card/index.ts`

**Interfaces:**
- Consumes: `ShareCardModel` and `SHARE_CARD_OUTPUT_SIZE` from `@/entities/share-card`.
- Produces: `ShareCard`, `ShareCardProps = { model: ShareCardModel }`; the component forwards its root `HTMLDivElement` ref.

- [ ] **Step 1: Write failing ratio and privacy tests**

Render portrait and square models separately and assert:

```ts
expect(card).toHaveAttribute("data-ratio", "portrait");
expect(card).toHaveStyle({ aspectRatio: "9 / 16" });
expect(screen.getByText("4 / 7")).toBeInTheDocument();
expect(screen.getByText("미리살림")).toBeInTheDocument();
expect(card.textContent).not.toMatch(/금액|소득|부채|저축액/i);
```

For the square model assert `data-ratio="square"` and `aspectRatio: "1 / 1"`.

- [ ] **Step 2: Run the widget test and verify RED**

Run: `npm.cmd --workspace @mirisallim/frontend run test -- --run src/widgets/share-card/ui/ShareCard.test.tsx`

Expected: FAIL because `ShareCard` does not exist.

- [ ] **Step 3: Implement the card**

Use `forwardRef<HTMLDivElement, ShareCardProps>`. The root element receives only `model`-derived text and fixed service copy:

```tsx
<div ref={ref} data-ratio={model.ratio} style={{ aspectRatio }}>
  <p>미리살림</p>
  <h2>{model.leftType}</h2>
  <h2>{model.rightType}</h2>
  <p>{model.tagline}</p>
  <p>{model.mutualHitCount} / {model.questionCount}</p>
  <p>돈 이야기를, 조금 더 편안하게</p>
</div>
```

Portrait와 square는 같은 정보 계층을 사용하고 레이아웃만 바꾼다. 본인 유형은 Green, 파트너 유형은 Purple을 사용하고, 카드에는 숨김 텍스트나 원본 결과 객체를 직렬화하지 않는다.

- [ ] **Step 4: Run the widget test, lint, and typecheck**

Run:

```text
npm.cmd --workspace @mirisallim/frontend run test -- --run src/widgets/share-card/ui/ShareCard.test.tsx
npm.cmd --workspace @mirisallim/frontend run lint
npm.cmd --workspace @mirisallim/frontend run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the task**

```text
git add apps/frontend/src/widgets/share-card
git commit -m "feat(web): render privacy-safe share cards"
```

---

### Task 3: 정확한 PNG 다운로드

**Files:**
- Create: `apps/frontend/src/features/download-share-card/lib/download-share-card.ts`
- Create: `apps/frontend/src/features/download-share-card/lib/download-share-card.test.ts`
- Create: `apps/frontend/src/features/download-share-card/ui/DownloadShareCardButton.tsx`
- Create: `apps/frontend/src/features/download-share-card/ui/DownloadShareCardButton.test.tsx`
- Modify: `apps/frontend/src/features/download-share-card/index.ts`

**Interfaces:**
- Consumes: `ShareCardModel`, `SHARE_CARD_RENDER_SIZE`, `SHARE_CARD_OUTPUT_SIZE`, `SHARE_CARD_PIXEL_RATIO`, an `HTMLDivElement` card node.
- Produces: `downloadShareCard(node, model): Promise<void>` and `DownloadShareCardButton({ cardRef, model })`.

- [ ] **Step 1: Write failing renderer and click tests**

Mock `html-to-image.toPng`, `document.fonts.ready`, `document.createElement("a")`, and anchor `click()`. Assert portrait calls:

```ts
expect(toPng).toHaveBeenCalledWith(node, expect.objectContaining({
  canvasHeight: 960,
  canvasWidth: 540,
  cacheBust: true,
  pixelRatio: 2,
}));
expect(anchor.download).toBe("mirisallim-light-result-portrait.png");
expect(anchor.href).toBe("data:image/png;base64,card");
expect(anchor.click).toHaveBeenCalledOnce();
```

Add the square assertion for a 540×540 render canvas with pixel ratio 2, producing 1080×1080, and `mirisallim-light-result-square.png`. Assert the button exposes pending and failure UI without navigating away.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm.cmd --workspace @mirisallim/frontend run test -- --run src/features/download-share-card`

Expected: FAIL because download implementation and button do not exist.

- [ ] **Step 3: Implement the download sequence**

`downloadShareCard()` performs these operations in order:

1. `await document.fonts.ready` when the FontFaceSet is available.
2. Resolve logical render size from `SHARE_CARD_RENDER_SIZE[model.ratio]`.
3. Call `toPng(node, { cacheBust: true, canvasWidth, canvasHeight, pixelRatio: SHARE_CARD_PIXEL_RATIO })`. `html-to-image` multiplies canvas dimensions by `pixelRatio`, so 540×960 at ratio 2 is exactly 1080×1920 and 540×540 at ratio 2 is exactly 1080×1080.
4. Create an anchor, set the fixed filename, click it, and remove it.

The filename must not contain session IDs, type names, taglines, or user input. The button must disable itself while rendering and surface `이미지를 저장하지 못했어요. 다시 시도해 주세요.` with `role="alert"` on failure.

- [ ] **Step 4: Run focused tests, lint, and typecheck**

Run:

```text
npm.cmd --workspace @mirisallim/frontend run test -- --run src/features/download-share-card
npm.cmd --workspace @mirisallim/frontend run lint
npm.cmd --workspace @mirisallim/frontend run typecheck
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit the task**

```text
git add apps/frontend/src/features/download-share-card
git commit -m "feat(web): download share card png"
```

---

### Task 4: 직접 접근 가능한 SharePage 통합

**Files:**
- Modify: `apps/frontend/src/pages/share/ui/SharePage.tsx`
- Create: `apps/frontend/src/pages/share/ui/SharePage.test.tsx`
- Modify: `apps/frontend/src/pages/share/index.ts`

**Interfaces:**
- Consumes: `fetchLightResult`, `lightResultQueryKey`, `toShareCardModel`, `ShareCard`, `DownloadShareCardButton`.
- Produces: `/result/light/:sessionId/share` direct-load page with ratio selection and PNG download.

- [ ] **Step 1: Write failing page integration tests**

Cover these states:

- missing session ID and API error render a neutral error card;
- `status: waiting` redirects to `/waiting/:sessionId` without creating a share model;
- ready response renders a portrait card by default;
- `세로 9:16` and `정사각형 1:1` buttons use `aria-pressed` and rebuild the model with the selected ratio;
- the page shows `금액, 부채, 저축액 같은 재무 정보는 카드에 담기지 않아요` outside the card;
- the `data-testid="share-card"` subtree contains no financial terms;
- no result data is written to web storage.

- [ ] **Step 2: Run the page test and verify RED**

Run: `npm.cmd --workspace @mirisallim/frontend run test -- --run src/pages/share/ui/SharePage.test.tsx`

Expected: FAIL because the current page is only a shell.

- [ ] **Step 3: Implement query, privacy gate, ratio state, and download UI**

Use the same TanStack Query key as F6 so navigation reuses ready data. Direct loads still fetch. The state order is missing ID → pending → error → waiting redirect → ready card. Keep `ShareCardModel` creation after the ready discriminator branch.

The ratio controls are real buttons:

```tsx
<button aria-pressed={ratio === "portrait"}>세로 9:16</button>
<button aria-pressed={ratio === "square"}>정사각형 1:1</button>
```

Render a responsive preview wrapper around the fixed-ratio card and connect its ref to `DownloadShareCardButton`.

- [ ] **Step 4: Run F7 verification**

Run:

```text
npm.cmd --workspace @mirisallim/frontend run api:check
npm.cmd --workspace @mirisallim/frontend run lint
npm.cmd --workspace @mirisallim/frontend run typecheck
npm.cmd --workspace @mirisallim/frontend run test -- --run
npm.cmd --workspace @mirisallim/frontend run build
```

Expected: OpenAPI clean-diff, zero lint/type errors, all Vitest files pass, and Vite production build exits 0.

- [ ] **Step 5: Commit the task**

```text
git add apps/frontend/src/pages/share
git commit -m "feat(web): complete privacy-safe result sharing"
```

## F7 Completion Gate

- Share model keys are exactly the six allowed keys.
- Waiting results never create or render a share model.
- Portrait and square downloads request exact output dimensions.
- Card DOM and PNG model contain no financial or raw-answer fields.
- Full frontend verification exits 0.
