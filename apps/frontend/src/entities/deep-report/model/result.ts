export type DeepCalculationBlockStatus = "available" | "partial" | "unavailable";

export interface DeepCalculationBlock {
  assumptions: string[];
  data: Record<string, unknown> | null;
  missingFields: string[];
  reason: string | null;
  status: DeepCalculationBlockStatus;
}

export type DeepReportRecord = Record<string, unknown>;

export interface DeepReport {
  cashflow: DeepCalculationBlock;
  goal: DeepCalculationBlock;
  housing: DeepCalculationBlock;
  issues: DeepReportRecord[];
  limitations: Record<string, string>;
  planning: DeepCalculationBlock;
  topics: DeepReportRecord[];
  values: DeepCalculationBlock;
  versions: Record<string, string | number>;
}

export interface DeepWaitingResult {
  partnerCompleted: boolean;
  status: "waiting";
}

export interface DeepReadyResult {
  agreements: DeepReportRecord[];
  operatingStatus: Record<string, unknown>;
  report: DeepReport;
  status: "ready";
}

export type DeepResult = DeepWaitingResult | DeepReadyResult;

export class DeepResultParseError extends Error {
  constructor(field: string) {
    super(`딥 결과 응답의 ${field} 형식이 올바르지 않아요.`);
    this.name = "DeepResultParseError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readRecord = (value: unknown, field: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new DeepResultParseError(field);
  return value;
};

const readString = (value: unknown, field: string): string => {
  if (typeof value !== "string") throw new DeepResultParseError(field);
  return value;
};

const readBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== "boolean") throw new DeepResultParseError(field);
  return value;
};

const readStringArray = (value: unknown, field: string, defaultValue: string[] = []): string[] => {
  if (value === undefined) return defaultValue;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new DeepResultParseError(field);
  }
  return value;
};

const readRecordArray = (value: unknown, field: string): DeepReportRecord[] => {
  if (!Array.isArray(value)) throw new DeepResultParseError(field);
  return value.filter(isRecord);
};

const parseCalculationBlock = (value: unknown, field: string): DeepCalculationBlock => {
  const block = readRecord(value, field);
  const status = block.status;
  if (status !== "available" && status !== "partial" && status !== "unavailable") {
    throw new DeepResultParseError(`${field}.status`);
  }

  const data = block.data;
  if (data !== undefined && data !== null && !isRecord(data)) {
    throw new DeepResultParseError(`${field}.data`);
  }

  return {
    assumptions: readStringArray(block.assumptions, `${field}.assumptions`),
    data: data === undefined ? null : data,
    missingFields: readStringArray(block.missingFields, `${field}.missingFields`),
    reason: block.reason === undefined || block.reason === null
      ? null
      : readString(block.reason, `${field}.reason`),
    status,
  };
};

const parseVersions = (value: unknown): Record<string, string | number> => {
  const versions = readRecord(value, "report.versions");
  const entries = Object.entries(versions);
  if (!entries.every(([, item]) => typeof item === "string" || typeof item === "number")) {
    throw new DeepResultParseError("report.versions");
  }
  return Object.fromEntries(entries) as Record<string, string | number>;
};

const parseLimitations = (value: unknown): Record<string, string> => {
  const limitations = readRecord(value, "report.limitations");
  const entries = Object.entries(limitations);
  if (!entries.every(([, item]) => typeof item === "string")) {
    throw new DeepResultParseError("report.limitations");
  }
  return Object.fromEntries(entries) as Record<string, string>;
};

const parseReport = (value: unknown): DeepReport => {
  const report = readRecord(value, "report");
  return {
    cashflow: parseCalculationBlock(report.cashflow, "report.cashflow"),
    goal: parseCalculationBlock(report.goal, "report.goal"),
    housing: parseCalculationBlock(report.housing, "report.housing"),
    issues: readRecordArray(report.issues, "report.issues"),
    limitations: parseLimitations(report.limitations),
    planning: parseCalculationBlock(report.planning, "report.planning"),
    topics: readRecordArray(report.topics, "report.topics"),
    values: parseCalculationBlock(report.values, "report.values"),
    versions: parseVersions(report.versions),
  };
};

export const parseDeepResult = (value: unknown): DeepResult => {
  const result = readRecord(value, "root");

  if (result.status === "waiting") {
    return {
      partnerCompleted: readBoolean(result.partnerCompleted, "partnerCompleted"),
      status: "waiting",
    };
  }

  if (result.status === "ready") {
    return {
      agreements: readRecordArray(result.agreements, "agreements"),
      operatingStatus: readRecord(result.operatingStatus, "operatingStatus"),
      report: parseReport(result.report),
      status: "ready",
    };
  }

  throw new DeepResultParseError("status");
};
