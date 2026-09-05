export const startKakaoLogin = (returnTo = "/deep"): void => {
  window.location.assign(
    `/api/v1/auth/kakao/start?returnTo=${encodeURIComponent(returnTo)}`,
  );
};
