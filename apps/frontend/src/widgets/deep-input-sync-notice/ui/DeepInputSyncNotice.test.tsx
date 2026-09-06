import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeepInputSyncNotice } from "./DeepInputSyncNotice";

describe("DeepInputSyncNotice", () => {
  it("turns known and unknown blocking issues into safe user copy", () => {
    render(
      <DeepInputSyncNotice
        blockingIssues={[
          { code: "SKIPPED_QUESTION_HAS_ANSWER", path: "values.D1" },
          { code: "NEW_SERVER_CODE", path: "secret.path" },
        ]}
        syncState="idle"
      />,
    );

    expect(screen.getByText("건너뛴 문항에 답변이 남아 있어요. 답변을 지우거나 문항을 다시 선택해 주세요.")).toBeInTheDocument();
    expect(screen.getByText("입력 내용을 확인해야 해요. 표시된 항목을 다시 확인해 주세요.")).toBeInTheDocument();
    expect(screen.queryByText(/SKIPPED_QUESTION_HAS_ANSWER|values\.D1|NEW_SERVER_CODE|secret\.path/)).not.toBeInTheDocument();
  });
});
