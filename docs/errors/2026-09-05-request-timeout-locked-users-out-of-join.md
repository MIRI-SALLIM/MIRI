# 요청 상한이 join 응답 유실 시 사용자를 세션에서 축출할 뻔했다

- 작성일: 2026-09-05
- 관련: 이슈 #42, #51, PR #52, 커밋 `8dda372`

## 무엇이 잘못됐나

이슈 #42는 "무응답 요청이 화면을 무기한 막는다"는 문제였고, 완료 조건이 "무응답 요청이 정해진 시간 뒤 오류로 확정된다"였다. 첫 구현은 그 조건을 문자 그대로 충족했다 — `createApiClient`의 `fetch` 래퍼에 10초 상한을 두어 **모든 메서드**에 적용했다.

`codex-sol-high` 검증이 병합 전에 잡았다. 그 상한이 사용자를 세션에서 영구히 축출하는 경로를 만든다.

1. 사용자가 초대 링크에서 `참여하고 시작하기`를 누른다
2. 서버가 `repository.join()`을 수행해 참여자를 추가하고 토큰을 만든다
3. 응답이 도달하지 못한다. 특히 참여자 쿠키를 담은 `Set-Cookie`가 유실된다
4. **10초 뒤 상한이 요청을 끊는다.** `JoinSessionButton`이 버튼을 활성 상태로 두고 "잠시 후 다시 시도해 주세요"로 **재시도를 권한다**
5. 재시도는 새 멱등성 키를 보내지만 서버는 참여자가 2명이라 409 `SESSION_ALREADY_JOINED`를 던진다
6. 쿠키가 없으므로 `GET /me/session`도 401이다. **그 세션에 들어갈 방법이 없다**

## 원인

**설계적 원인**: 이슈의 완료 조건을 충족하는 것과 그 변경이 시스템 전체에 안전한 것을 같은 것으로 취급했다. 상한은 "요청을 끊는다"는 한 가지 일만 하지만, **끊는 것이 안전한지는 요청마다 다르다.** 조회를 끊으면 다시 조회하면 되고, 쓰기를 끊으면 클라이언트가 서버가 적용했는지 알 수 없다.

그 차이를 결정적으로 만든 것은 **계약 공백과의 결합**이었다. 백엔드가 `POST /invitations/{code}/join`에 `Idempotency-Key` 헤더를 선언하지만(`apps/backend/main.py:803`) `repository.join()`에 넘기지 않는다(`:826`). 그래서 재시도가 첫 결과를 재생하지 못한다.

**결함은 상한이 만든 것이 아니다.** TCP 타임아웃이나 사용자의 새로고침 후 재클릭으로도 도달할 수 있었다. 상한은 그 경로를 **10초마다 자동으로, 재시도를 권하는 문구와 함께** 열었을 뿐이다. 그 차이가 확률을 바꾼다.

## 해결

상한을 **GET에만** 적용했다.

```ts
if (input.method !== "GET") {
  // #42 targets render-blocking reads, which are GET requests. Aborting a request with
  // side effects leaves the client unable to know whether the server applied it.
  // Join cannot recover from that: the backend declares an Idempotency-Key header on
  // POST /invitations/{code}/join (apps/backend/main.py:803) but never passes it to
  // repository.join (:826), so a retry after a lost response is answered 409 forever.
  return fetch(input);
}
```

이슈가 지목한 피해는 전부 렌더링을 막는 조회이고 그건 모두 GET이다. 예외 목록을 유지하지 않는 규칙 하나로 잠금 경로가 사라진다.

**택하지 않은 대안 두 가지.**

- **전부 상한 + 백엔드 이슈 등록** — 그 이슈가 해결되기 전까지 노출이 남는다. 사용자가 이미 참여한 세션에서 영구히 잠기는 것은 감수할 대가가 아니다
- **join·create만 제외** — `submit`과 `nudge`는 백엔드 보호가 있어 상한을 줘도 안전하지만, 예외 목록은 새 엔드포인트가 판단 없이 상한을 받게 만든다

백엔드 결함은 이슈 **#51**로 등록했다. 그것이 해결되면 상한을 뮤테이션까지 넓힐 수 있고, 무응답 POST에서 버튼이 계속 도는 현재 동작도 함께 고칠 수 있다.

## 재발 방지

`client.test.ts`에 **비-GET이 상한을 받지 않는다**는 테스트를 넣었다. POST를 pending mock으로 만들고 상한의 2배를 advance한 뒤 `signal.aborted === false`를 단정한다. 이것 없이는 다음 사람이 무심코 전체 메서드로 되돌릴 수 있다.

**앞으로 의심할 것**: 횡단 관심사(timeout, retry, 캐시, 인터셉터)를 **모든 호출에 일괄 적용**할 때는, 그 동작이 안전한지가 호출마다 다른지 먼저 묻는다. 특히 쓰기 요청은 "끊어도 되는가"와 "다시 보내도 되는가"가 별개이고, 후자는 서버 계약에 달려 있다. **계약이 약속만 하고 이행하지 않는 경우**가 있으므로 헤더 존재만으로 안전을 가정하지 않는다.
