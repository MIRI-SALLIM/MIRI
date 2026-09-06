import { apiClient, requestApi, type components } from "@/shared/api";

import {
  parseAgreementRequest,
  parseAgreementVersionRequest,
  parseDeepAgreement,
  parseEditAgreement,
  type AgreementRequestV3,
  type AgreementVersionRequest,
  type DeepAgreement,
  type EditAgreementV3,
} from "../model/schema";

export type { AgreementRequestV3, AgreementVersionRequest, DeepAgreement, EditAgreementV3 } from "../model/schema";
export type DecisionTerms = components["schemas"]["DecisionTerms"];

export const deepAgreementsQueryKey = (sessionId: string) => ["deep-agreements", sessionId] as const;
export const deepAgreementQueryKey = deepAgreementsQueryKey;

export const fetchDeepAgreements = async (sessionId: string): Promise<DeepAgreement[]> => {
  const response = await requestApi(
    apiClient.GET("/api/v1/deep/v3/sessions/{session_id}/agreements", {
      params: { path: { session_id: sessionId } },
    }),
  );

  return response.map(parseDeepAgreement);
};

export const proposeDeepAgreement = async (
  sessionId: string,
  body: AgreementRequestV3,
): Promise<DeepAgreement> =>
  parseDeepAgreement(
    await requestApi(
      apiClient.POST("/api/v1/deep/v3/sessions/{session_id}/agreements", {
        body: parseAgreementRequest(body),
        params: { path: { session_id: sessionId } },
      }),
    ),
  );

export const editDeepAgreement = async (
  sessionId: string,
  agreementId: string,
  body: EditAgreementV3,
): Promise<DeepAgreement> =>
  parseDeepAgreement(
    await requestApi(
      apiClient.PATCH("/api/v1/deep/v3/sessions/{session_id}/agreements/{agreement_id}", {
        body: parseEditAgreement(body),
        params: { path: { agreement_id: agreementId, session_id: sessionId } },
      }),
    ),
  );

const changeDeepAgreement = async (
  action: "confirm" | "defer",
  sessionId: string,
  agreementId: string,
  expectedVersion: number,
): Promise<DeepAgreement> => {
  const body: AgreementVersionRequest = parseAgreementVersionRequest({ expectedVersion });
  const response = action === "confirm"
    ? await requestApi(
      apiClient.POST("/api/v1/deep/v3/sessions/{session_id}/agreements/{agreement_id}/confirm", {
        body,
        params: { path: { agreement_id: agreementId, session_id: sessionId } },
      }),
    )
    : await requestApi(
      apiClient.POST("/api/v1/deep/v3/sessions/{session_id}/agreements/{agreement_id}/defer", {
        body,
        params: { path: { agreement_id: agreementId, session_id: sessionId } },
      }),
    );

  return parseDeepAgreement(response);
};

export const confirmDeepAgreement = (
  sessionId: string,
  agreementId: string,
  expectedVersion: number,
): Promise<DeepAgreement> => changeDeepAgreement("confirm", sessionId, agreementId, expectedVersion);

export const deferDeepAgreement = (
  sessionId: string,
  agreementId: string,
  expectedVersion: number,
): Promise<DeepAgreement> => changeDeepAgreement("defer", sessionId, agreementId, expectedVersion);
