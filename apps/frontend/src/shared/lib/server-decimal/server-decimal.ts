/**
 * 서버의 `Annotated[Decimal, Field(ge=0, allow_inf_nan=False, max_digits, decimal_places)]`
 * 판정을 그대로 재현한다. 서버는 v3 검증 실패를 필드 정보 없는 422로 뭉개므로,
 * 여기서 갈리면 사용자는 어느 값이 문제인지 알 수 없다.
 *
 * Pydantic은 자릿수를 세기 전에 후행 0을 정규화로 없앤다. `1.000000000000`이
 * 소수 12자리인데도 통과하고 `0.12345678901`이 11자리라 막히는 이유다.
 */

const DECIMAL_SHAPE = /^\s*([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?\s*$/;

export type ServerDecimalLimits = {
  /** 정규화 후 유효 숫자 총 개수 상한 (Pydantic `max_digits`) */
  maxDigits: number;
  /** 정규화 후 소수 자릿수 상한 (Pydantic `decimal_places`) */
  decimalPlaces: number;
  /** 음수를 허용하는가 (Pydantic `ge=0`이면 false) */
  allowNegative?: boolean;
};

export const isServerDecimal = (value: string | number, limits: ServerDecimalLimits): boolean => {
  const match = String(value).match(DECIMAL_SHAPE);
  if (!match) {
    return false;
  }

  const [, sign, integerPart = "", fractionPart = "", exponentPart] = match;
  if (integerPart.length === 0 && fractionPart.length === 0) {
    return false;
  }

  // 계수와 10의 지수로 분해한다. 부동소수로 바꾸면 자릿수가 어긋나므로 문자열로만 다룬다.
  let coefficient = `${integerPart}${fractionPart}`.replace(/^0+/, "");
  let scale = -fractionPart.length + (exponentPart === undefined ? 0 : Number.parseInt(exponentPart, 10));

  if (coefficient.length === 0) {
    return true; // 0은 어떤 표기로 써도 통과한다.
  }
  if (sign === "-" && !limits.allowNegative) {
    return false;
  }

  // Pydantic이 자릿수를 세기 전에 하는 정규화.
  while (coefficient.length > 1 && coefficient.endsWith("0")) {
    coefficient = coefficient.slice(0, -1);
    scale += 1;
  }

  let digits: number;
  let decimals: number;
  if (scale >= 0) {
    digits = coefficient.length + scale;
    decimals = 0;
  } else if (-scale > coefficient.length) {
    digits = -scale;
    decimals = -scale;
  } else {
    digits = coefficient.length;
    decimals = -scale;
  }

  return (
    digits <= limits.maxDigits &&
    decimals <= limits.decimalPlaces &&
    digits - decimals <= limits.maxDigits - limits.decimalPlaces
  );
};
