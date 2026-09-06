import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import type { DeepInputV3 } from "@/entities/deep-input";
import type { DeepQuestions } from "@/entities/deep-question";

import { DeepQuestionsForm } from "./DeepQuestionsForm";

const questions: DeepQuestions = {
  version: "deep-v3",
  title: "서버 질문 제목",
  valueQuestions: [],
  scaleLabels: [],
  planningQuestions: [{ id: "C5", text: "서버 C5", type: "constraints", bindings: ["constraints"], options: [], optional: true, requiresSharedBudget: false }],
  followups: [],
  consent: { version: "deep-sharing-v2", finance: "재무", values: "가치관", privateNotes: "개인 메모" },
};

const initialDraft = (): DeepInputV3 => ({
  inputVersion: "deep-input-v3",
  assetsStatus: "known",
  debtsStatus: "known",
  constraints: [],
});

describe("DeepQuestionsForm constraint updater", () => {
  it("applies a condition edit to the latest constraints instead of a render snapshot", async () => {
    const user = userEvent.setup();
    const externalConstraint = {
      id: "external-constraint",
      kind: "other" as const,
      scope: "household" as const,
      strength: "required" as const,
      allowBorrowing: null,
      note: "외부 변경",
    };

    function Harness() {
      const [draft, setDraft] = useState(initialDraft);
      const updateDraft = (updater: (current: DeepInputV3) => DeepInputV3) => {
        setDraft((current) => updater({ ...current, constraints: [...(current.constraints ?? []), externalConstraint] }));
      };

      return <DeepQuestionsForm disabled={false} draft={draft} onBlur={() => undefined} onChange={updateDraft} questions={questions} />;
    }

    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "조건 추가" }));

    expect(screen.getByRole("heading", { name: "조건 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "조건 2" })).toBeInTheDocument();
  });
});
