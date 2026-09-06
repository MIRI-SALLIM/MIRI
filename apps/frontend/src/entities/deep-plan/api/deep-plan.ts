import { apiClient, requestApi, type components } from "@/shared/api";

import { parseSharedPlanV3 } from "../model/schema";

export type SharedPlanV3 = components["schemas"]["SharedPlanV3-Input"];
export type DeepPlanResponse = Omit<components["schemas"]["PlanResponseV3"], "plan"> & { plan: SharedPlanV3 };

export const deepPlanQueryKey = (sessionId: string) => ["deep-plan", sessionId] as const;

const parsePlanResponse = (response: components["schemas"]["PlanResponseV3"]): DeepPlanResponse => ({
  ...response,
  plan: parseSharedPlanV3(response.plan),
});

export const fetchDeepPlan = async (sessionId: string): Promise<DeepPlanResponse> =>
  parsePlanResponse(
    await requestApi(
      apiClient.GET("/api/v1/deep/v3/sessions/{session_id}/plan", {
        params: { path: { session_id: sessionId } },
      }),
    ),
  );

export const updateDeepPlan = async (
  sessionId: string,
  expectedVersion: number,
  plan: SharedPlanV3,
): Promise<DeepPlanResponse> =>
  parsePlanResponse(
    await requestApi(
      apiClient.PATCH("/api/v1/deep/v3/sessions/{session_id}/plan", {
        body: { expectedVersion, plan: parseSharedPlanV3(plan) },
        params: { path: { session_id: sessionId } },
      }),
    ),
  );

export const confirmDeepPlan = async (sessionId: string, planVersion: number): Promise<DeepPlanResponse> =>
  parsePlanResponse(
    await requestApi(
      apiClient.POST("/api/v1/deep/v3/sessions/{session_id}/plan/confirm", {
        body: { planVersion },
        params: { path: { session_id: sessionId } },
      }),
    ),
  );
