# MIRI_FE — Claude Code guidance

프로젝트 공통 규칙은 `AGENTS.md`에 있다. 먼저 읽을 것. 이 파일은 거기에 더해 git 작업 절차를 규정한다.

## Git flow

**작업 단위 하나 = 이슈 하나 = 브랜치 하나 = PR 하나.** 구현을 시작하기 전에 이슈부터 만든다.

### 1. 이슈 생성

각 F 단계(또는 독립적인 작업 단위)에 착수하기 전에 GitHub 이슈를 만든다.

~~~bash
gh issue create --title "[Frontend] F3: 랜딩·세션 시작 구현" --body-file <파일>
~~~

- 제목 형식: `[Frontend] F<번호>: <한국어 요약>`
- 본문에는 최소한 개요, 참고 문서, 선행 조건, 작업 파일(생성/수정), 인터페이스, 구현 체크리스트, 완료 조건, 검증 명령을 담는다. 기존 이슈 #4(F2)가 이 형식의 참고 사례다.
- 본문은 `docs/superpowers/plans/2026-08-06-mirisallim-light-frontend.md`의 해당 F 섹션에서 파생시킨다. 계획서가 원본이고 이슈는 그 사본이다. 둘이 어긋나면 계획서를 고치고 이슈를 다시 맞춘다.

### 2. 브랜치 생성

이슈 번호를 브랜치 이름에 넣는다. **이슈 번호이지 F 단계 번호가 아니다** — GitHub은 이슈와 PR이 번호를 공유하므로 둘은 어긋난다. 실제로 F1은 이슈 #1, F2는 이슈 #4였다.

~~~text
<type>/<이슈번호>-<영문-kebab-슬러그>
~~~

~~~bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/7-landing-session
~~~

- `type`은 `feature` | `fix` | `chore` | `docs` 중 하나다.
- 항상 최신 `develop`에서 딴다. 다른 F 브랜치 위에 쌓지 않는다.
- 기존 사례: `chore/1-frontend-foundation`(이슈 #1), `feature/4-openapi-client`(이슈 #4).

### 3. 커밋

- Conventional Commits를 따르고 프론트엔드 스코프는 `web`을 쓴다: `feat(web):`, `fix(web):`, `chore(web):`. 문서는 스코프 없이 `docs:`.
- 제목은 영문 명령형 한 줄. 본문이 필요하면 왜 그렇게 했는지를 쓴다(무엇을 했는지는 diff가 말한다).
- 관련 없는 변경을 같은 커밋에 섞지 않는다. 경로를 명시해 stage한다(`git add <paths>`), `git add -A`를 쓰지 않는다.

### 4. PR과 병합

~~~bash
git push -u origin <브랜치>
gh pr create --base develop --title "<제목>" --body "Closes #<이슈번호>

<요약>"
~~~

- base는 항상 `develop`이다. `main`으로 직접 올리지 않는다.
- 본문에 `Closes #<이슈번호>`를 넣어 병합 시 이슈가 자동으로 닫히게 한다.
- 이번 작업에서 사소하지 않은 설계·코드 오류를 발견해 고쳤다면, 병합 전에 `docs/errors/`에 기록했는지 확인한다(형식은 `docs/errors/TEMPLATE.md`, 규칙은 `AGENTS.md` 참고). 오타 수준의 사소한 실수는 대상이 아니다.
- 병합 전에 아래 검증이 전부 통과해야 한다.

~~~bash
npm --workspace @mirisallim/frontend run api:check
npm --workspace @mirisallim/frontend run lint
npm --workspace @mirisallim/frontend run typecheck
npm --workspace @mirisallim/frontend run test -- --run
npm --workspace @mirisallim/frontend run build
~~~

- `develop`에 직접 push하거나 PR 없이 fast-forward 병합하지 않는다. 사용자가 명시적으로 지시한 경우에만 예외로 하고, 그때도 예외라는 사실을 보고한다.

### 5. 병합 후

- 원격 브랜치를 삭제한다(`gh pr merge --delete-branch` 또는 `git push origin --delete <브랜치>`).
- 계획서의 해당 F 섹션 체크박스를 갱신한다.

## 이 저장소의 특이사항

- **worktree 삭제 주의.** npm workspaces라 `node_modules/@mirisallim/frontend`가 `apps/frontend`를 가리키는 링크다. 임시 worktree에 `node_modules`를 junction으로 연결한 뒤 `git worktree remove --force`를 하면 재귀 삭제가 링크를 타고 들어가 원본의 `apps/frontend`까지 지운다. 실제로 발생한 적이 있다. 제거 전에 커밋·push를 끝내고, 링크를 먼저 확실히 지운 뒤 진행한다.
- **의존성을 새로 설치하지 않는다.** F4~F8에 필요한 패키지는 `028797c`에서 일괄 설치했다. 새 의존성이 정말 필요하면 병렬 트랙이 `develop`에서 만나는 시점에 별도 커밋으로 추가한다. 루트 `package-lock.json`이 하나뿐이라 병렬 브랜치가 각자 건드리면 충돌한다.
- **`openapi.json`은 백엔드 소유의 읽기 전용 스냅샷이다.** 프론트엔드에서 수정하거나 다시 뽑지 않는다. `schema.d.ts`는 생성물이므로 수동 편집하지 않고 `api:generate`로만 갱신한다.
- **`schema.d.ts`의 line ending 차이.** `git status`에 ` M`으로 보여도 내용이 같으면 정상이다. 판단 기준은 `git status`가 아니라 `api:check`의 종료 코드다.
