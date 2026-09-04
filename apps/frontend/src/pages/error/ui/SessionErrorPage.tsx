import type { ApiErrorKind } from "@/shared/api";

const copy: Record<ApiErrorKind, { description: string; title: string }> = {
  unauthorized: {
    title: "세션을 확인할 수 없어요",
    description: "처음 화면에서 새 대화를 시작하거나 초대 링크로 다시 참여해 주세요.",
  },
  "not-found": {
    title: "페이지를 찾을 수 없어요",
    description: "주소가 올바른지 확인한 뒤 다시 시도해 주세요.",
  },
  conflict: {
    title: "요청을 처리할 수 없어요",
    description: "화면을 새로고침한 뒤 현재 상태를 다시 확인해 주세요.",
  },
  expired: {
    title: "대화 시간이 만료됐어요",
    description: "새 대화를 시작해 다시 진행해 주세요.",
  },
  validation: {
    title: "입력 내용을 확인해 주세요",
    description: "필수 항목을 다시 확인한 뒤 시도해 주세요.",
  },
  "rate-limited": {
    title: "요청이 너무 많아요",
    description: "잠시 후 다시 시도해 주세요.",
  },
  timeout: {
    title: "응답이 오래 걸리고 있어요",
    description: "잠시 후 다시 시도해 주세요.",
  },
  unavailable: {
    title: "지금은 연결이 원활하지 않아요",
    description: "잠시 후 다시 시도해 주세요.",
  },
  unknown: {
    title: "요청을 완료하지 못했어요",
    description: "잠시 후 다시 시도해 주세요.",
  },
};

export interface SessionErrorPageProps {
  kind?: ApiErrorKind;
}

export function SessionErrorPage({ kind = "unknown" }: SessionErrorPageProps) {
  const { description, title } = copy[kind];

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col gap-3 px-5 py-16 sm:px-8">
      <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-ink">{title}</h1>
      <p className="text-ink-muted">{description}</p>
    </section>
  );
}
