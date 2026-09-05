/**
 * 케이스와 기대값은 추측이 아니라 `apps/backend/deep/schemas.py`의 `DebtInput`을
 * pydantic으로 직접 호출해 뽑은 것이다. 미러가 서버보다 엄격하면 저장이 막히고,
 * 느슨하면 사용자가 필드 정보 없는 422를 받는다. 양쪽 다 결함이다.
 */
import { describe, expect, it } from "vitest";

import { isServerDecimal } from "./server-decimal";

const ANNUAL_RATE = { maxDigits: 14, decimalPlaces: 10 } as const;

// [입력, 서버가 허용하는가]
const serverVerdicts: ReadonlyArray<readonly [string, boolean]> = [
  ["0", true],
  ["0.0", true],
  ["1", true],
  ["1.5", true],
  ["0.035", true],
  ["1234.5", true],
  ["9999", true],
  ["9999.9999999999", true],
  ["1.0", true],
  ["1.00", true],
  ["1.0000000000", true],
  ["1.00000000000", true],
  ["1.000000000000", true],
  ["0.0000000000", true],
  ["0.00000000000", true],
  ["0.1234567890", true],
  ["0.12345678901", false],
  ["1.1234567890", true],
  ["1.12345678901", false],
  ["10000", false],
  ["12345", false],
  ["12345.1", false],
  ["1e3", true],
  ["1e4", false],
  ["1e14", false],
  ["1.23456789012345", false],
  ["-1", false],
  ["-0.5", false],
  ["-0", true],
  ["abc", false],
  ["", false],
  ["1.", true],
  ["0.1", true],
  ["00001.5", true],
  ["+1.5", true],
  [" 1.5", true],
  ["1.5 ", true],
  ["Infinity", false],
  ["NaN", false],
  ["1e-3", true],
  ["1e-11", false],
];

describe("isServerDecimal", () => {
  it.each(serverVerdicts)("%j 은 서버 판정과 같다", (value, allowed) => {
    expect(isServerDecimal(value, ANNUAL_RATE)).toBe(allowed);
  });

  it("숫자 입력도 문자열과 같은 규칙으로 본다", () => {
    expect(isServerDecimal(1.5, ANNUAL_RATE)).toBe(true);
    expect(isServerDecimal(0.035, ANNUAL_RATE)).toBe(true);
    expect(isServerDecimal(10000, ANNUAL_RATE)).toBe(false);
    expect(isServerDecimal(-1, ANNUAL_RATE)).toBe(false);
  });

  it("음수 허용은 옵션으로 분리돼 있다", () => {
    expect(isServerDecimal("-1", { maxDigits: 14, decimalPlaces: 10, allowNegative: true })).toBe(true);
  });
});
