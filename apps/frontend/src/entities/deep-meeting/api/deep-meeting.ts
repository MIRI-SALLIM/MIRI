import { apiClient, requestApi } from "@/shared/api";

import {
  parseMeetingCompletion,
  parseMeetingContext,
  parseMeetingExplanation,
  parseMeetingGuide,
  parseMeetingStandards,
  parseOwnMeeting,
  type CompleteMeetingInput,
  type MeetingContext,
  type MeetingCompletion,
  type MeetingExplanation,
  type MeetingGuide,
  type MeetingStandards,
  type OwnMeeting,
  type SaveMeetingAnswersInput,
  type SaveMeetingConsentInput,
} from "../model/meeting";

export const meetingGuideQueryKey = (sessionId: string) => ["deep-meeting-guide", sessionId] as const;
export const ownMeetingQueryKey = (sessionId: string) => ["deep-meeting-own", sessionId] as const;
export const meetingContextQueryKey = (sessionId: string) => ["deep-meeting-context", sessionId] as const;
export const meetingExplanationQueryKey = (sessionId: string) => ["deep-meeting-explanation", sessionId] as const;
export const meetingStandardsQueryKey = (sessionId: string) => ["deep-meeting-standards", sessionId] as const;

const meetingPathParams = (sessionId: string) => ({ params: { path: { session_id: sessionId } } });

export const fetchMeetingGuide = async (sessionId: string): Promise<MeetingGuide> =>
  parseMeetingGuide(
    await requestApi(
      apiClient.GET("/api/v1/deep/v3/sessions/{session_id}/meeting/guide", meetingPathParams(sessionId)),
    ),
  );

export const fetchOwnMeeting = async (sessionId: string): Promise<OwnMeeting> =>
  parseOwnMeeting(
    await requestApi(
      apiClient.GET("/api/v1/deep/v3/sessions/{session_id}/meeting/me", meetingPathParams(sessionId)),
    ),
  );

export const saveMeetingAnswers = async (sessionId: string, body: SaveMeetingAnswersInput): Promise<OwnMeeting> =>
  parseOwnMeeting(
    await requestApi(
      apiClient.PATCH("/api/v1/deep/v3/sessions/{session_id}/meeting/me", {
        ...meetingPathParams(sessionId),
        body,
      }),
    ),
  );

export const saveMeetingConsent = async (sessionId: string, body: SaveMeetingConsentInput): Promise<OwnMeeting> =>
  parseOwnMeeting(
    await requestApi(
      apiClient.POST("/api/v1/deep/v3/sessions/{session_id}/meeting/me/consent", {
        ...meetingPathParams(sessionId),
        body,
      }),
    ),
  );

export const revokeMeetingConsent = async (sessionId: string): Promise<OwnMeeting> =>
  parseOwnMeeting(
    await requestApi(
      apiClient.DELETE("/api/v1/deep/v3/sessions/{session_id}/meeting/me/consent", meetingPathParams(sessionId)),
    ),
  );

export const completeMeeting = async (sessionId: string, body: CompleteMeetingInput): Promise<MeetingCompletion> =>
  parseMeetingCompletion(
    await requestApi(
      apiClient.POST("/api/v1/deep/v3/sessions/{session_id}/meeting/complete", {
        ...meetingPathParams(sessionId),
        body,
      }),
    ),
  );

export const fetchMeetingContext = async (sessionId: string): Promise<MeetingContext> =>
  parseMeetingContext(
    await requestApi(
      apiClient.GET("/api/v1/deep/v3/sessions/{session_id}/meeting/context", meetingPathParams(sessionId)),
    ),
  );

export const fetchMeetingExplanation = async (sessionId: string): Promise<MeetingExplanation> =>
  parseMeetingExplanation(
    await requestApi(
      apiClient.GET("/api/v1/deep/v3/sessions/{session_id}/meeting/explanation", meetingPathParams(sessionId)),
    ),
  );

export const fetchMeetingStandards = async (sessionId: string): Promise<MeetingStandards> =>
  parseMeetingStandards(
    await requestApi(
      apiClient.GET("/api/v1/deep/v3/sessions/{session_id}/meeting/standards", meetingPathParams(sessionId)),
    ),
  );

