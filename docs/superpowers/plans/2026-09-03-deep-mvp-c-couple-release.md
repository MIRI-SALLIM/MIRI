# Deep MVP C — Couple Flow and Release Implementation Plan

**2026-09-03 실행 현황:** C1~C4 로컬 구현, C5 실DB 테스트/CI job/프론트 계약 작성 및 임시 Mongo7.0.39의 DB12개 검증 통과(해당 실행 총15 passed). 원격 CI·컨테이너·브라우저 E2E·배포 승인·커밋/푸시는 미완료. 아래는 원래 실행 체크리스트이며 실제 결과와 구체화한 계약은 [최신 C 인계](../../handoffs/2026-09-03-deep-mvp-c-progress.md)를 참고한다.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계정 2개의 입력에서 공동 결과·템플릿 대화·합의까지 완성하고 프론트 연동 가능한 계약을 인계한다.

**Architecture:** 세션의 현재 revision과 공유 동의가 공개 권한의 원본이다. DB의 조건부 갱신으로 제출·계획·공개를 통제하고, 보고서 캐시는 단독 조회 권한을 갖지 않는다.

**Tech Stack:** FastAPI, Pydantic, PyMongo Async, pytest/AnyIO, 기존 OpenAPI export, GitHub Actions Mongo service.

**Spec:** `../specs/2026-09-03-mirisallim-deep-mode-design-draft.md`, [통합 실행 계획](2026-09-03-deep-mvp-implementation.md), [A](2026-09-03-deep-mvp-a-auth.md), [B](2026-09-03-deep-mvp-b-engine.md).

## Global Constraints

- 두 사람의 입력과 동일 공동 계획 확인·공개 동의 후에만 결과를 공개한다.
- 초대 코드는 로그인 대체 수단이 아니다.
- 라이트의 기존 익명 참여는 유지한다.
- source와 계산 버전은 서버가 지정한다.
- 파트너에게 공개하지 않은 값은 파생 결과에서도 제외한다.
- 제출 후 입력·계획을 몰래 바꾸지 않는다.
- LLM·정책 데이터가 없어도 템플릿 결과는 완결된다.
- 실제 구현·외부 앱 등록·프로덕션 배포는 계획 작성과 별도다.

## C1. 멤버십·질문·자기 입력·공동 계획

**Files:** Create `apps/backend/deep/{repository,service,router,dependencies}.py`, `tests/integration/test_deep_sessions.py`; Modify `apps/backend/main.py`, `apps/backend/schemas.py`, `apps/backend/tests/conftest.py`, `apps/backend/tests/deep_factory.py`.

**Consumes:** A `Principal`, `require_account`, `require_trusted_origin`; B `DeepInput`, `SharedPlan`, `SaveDeepInputRequest`, `load_questions`.

**Produces:** `DeepRepository(database)`와 `DeepService(repo)`; `get_deep_service()` 의존성. 저장소 async method:

- `create(user_id,idempotency_key,payload_hash,now) -> dict`.
- `join(code,user_id,idempotency_key,now) -> dict`.
- `get_for_member(session_id,user_id,now) -> dict`.
- `save_input(session_id,user_id,expected_revision,input,now) -> dict`.
- `update_plan(session_id,user_id,expected_version,plan,now) -> dict`.
- `confirm_plan(session_id,user_id,plan_version,now) -> dict`.
- `ensure_indexes()`.

세션 문서 형식:

```text
id, round=1, version=0, status=collecting|waiting|ready|closed,
members={A:{userId,revision,input,submittedAt,confirmedPlanVersion,consent},B:...},
plan={version,data}, questionVersion,ruleVersion,copyVersion,consentVersion,
reportId, createdAt, expiresAt
```

API: `/api/v1/deep/questions`, `POST /deep/sessions`, `POST /deep/invitations/{code}/join`, `GET/PATCH /deep/sessions/{id}/me/input`, `GET/PATCH /deep/sessions/{id}/plan`, `POST /deep/sessions/{id}/plan/confirm`. 위 경로는 모두 `/api/v1` 아래다. self input GET 응답은 `{revision,input}`이며 상대 subdocument를 반환하지 않는다.

- [ ] 첫 실패 테스트:

```python
from fastapi.testclient import TestClient
from auth.dependencies import require_account
from auth.models import Principal
from main import app

def test_created_deep_session_recovers_only_own_input():
    app.dependency_overrides[require_account] = lambda: Principal(user_id='user-a')
    try:
        with TestClient(app) as client:
            response = client.post('/api/v1/deep/sessions',json={},
                headers={'Origin':'http://testserver','Idempotency-Key':'create-a'})
            assert response.status_code == 201
            sid = response.json()['id']
            own = client.get(f'/api/v1/deep/sessions/{sid}/me/input').json()
            assert set(own) == {'revision','input'}
            assert 'guesses' not in own['input']
    finally:
        app.dependency_overrides.pop(require_account,None)
```

  conftest의 테스트 설정은 A3를 사용한다. `get_deep_service`는 fake repository를 주입하되 실제 구현의 조건·오류를 재현한다. C5에서 같은 조건을 실제 DB로 검증한다.
- [ ] 테스트 실패 확인 후 메서드를 구현한다. 저장소는 인증된 계정 ID만 사용하고 body의 role/userId를 거부한다. 같은 계정의 A/B 참여, 세 번째 계정, 닫힌/만료된 초대를 거부한다.

  입력 자동저장은 전체 DeepInput을 PATCH하되 expectedRevision을 필수로 한다. 업데이트는 아래 조건과 함께 `$set`/`$inc`를 한 번에 실행한다.

```python
query = {
    'id': session_id, f'members.{role}.userId': user_id,
    f'members.{role}.revision': expected_revision,
    f'members.{role}.submittedAt': None, 'status': {'$in':['collecting','waiting']},
    'expiresAt': {'$gt': now},
}
```

  role은 DB 멤버십에서 서버가 구한다. 요청자의 미제출 입력은 상대 제출 여부와 관계없이 저장 가능하다. 계획은 누구나 제안할 수 있지만 한쪽이라도 제출하면 PATCH409. 계획 변경은 plan.version 증가와 양쪽 confirmedPlanVersion 초기화를 같은 갱신으로 처리한다.

  unique indexes: id, invitationCode, 생성 멱등성 `(creatorUserId,idempotencyKey)`; TTL expiresAt. 재사용 key+다른 payload는409, 같은 payload는 기존 결과 반환. 초대는 회원+IP별10분20회 Mongo TTL 제한을 둔다.

  `main.py` 기존 deep question route는 제거 후 새 router로 단일 등록한다. deep-v1은 인증 후 8문항 조회만, 기본 deep-v2는10문항. legacy `POST /api/v1/sessions`는 mode=light만 허용한다. 기존 legacy deep 문서가 실제 있는지는 배포 전에 읽기 전용으로 조사하고, 발견하면 Light 결과로 계산하지 않고 명시적 unsupported 오류를 반환한다.
- [ ] 모드 분리·재시도·wrong role·타인404·own input 격리·계획 확인 무효화·제출 후409 테스트 통과.
- [ ] `feat(deep): add private drafts and shared-plan workflow` 커밋.

## C2. 제출 불변성과 공동 공개 준비

**Files:** Create `apps/backend/deep/state.py`, `tests/unit/test_deep_state.py`, `tests/integration/test_deep_submit.py`; Modify `deep/repository.py`, `service.py`, `router.py`.

**Interfaces:**

- `can_publish(doc: dict, now: datetime) -> bool`.
- repo `submit(session_id,user_id,expected_revision,plan_version,consent,now) -> dict`.
- repo `claim_publication(session_id,expected_version,now) -> dict | None`: 입력 스냅샷을 고정한 publicationStamp 반환.
- API `POST /deep/sessions/{id}/me/submit`, `GET /deep/sessions/{id}/status`.

`tests/deep_factory.py`에 `ready_document()`를 추가한다. 문서의 A/B는 서로 다른 userId, revision1, submittedAt, confirmedPlanVersion1, consentVersion deep-sharing-v1, shareFinance/Values true; plan.version1, round1, status waiting, expiresAt은2099-01-01 UTC다. B2 fixture의 완전 입력을 각 input에 둔다.

```python
from datetime import datetime, timezone

def ready_document():
    now = datetime(2026,9,3,tzinfo=timezone.utc)
    members = {role:{'userId':role,'revision':1,'input':sample_input(),
        'submittedAt':now,'confirmedPlanVersion':1,
        'consent':{'version':'deep-sharing-v1','submittedRevision':1,'round':1,
                   'shareFinance':True,'shareValues':True}}
        for role in ['A','B']}
    return {'id':'deep-test','round':1,'version':1,'status':'waiting','members':members,
        'plan':{'version':1,'data':sample_plan()},'createdAt':now,
        'expiresAt':datetime(2099,1,1,tzinfo=timezone.utc),'reportId':None,
        'questionVersion':'deep-v2','ruleVersion':'deep-rules-v1',
        'copyVersion':'deep-copy-ko-v1','consentVersion':'deep-sharing-v1'}
```

- [ ] 실패 테스트:

```python
from datetime import datetime, timezone
from tests.deep_factory import ready_document
from deep.state import can_publish

def test_matching_submissions_and_plan_are_all_required():
    now = datetime(2026,9,3,tzinfo=timezone.utc)
    doc = ready_document()
    assert can_publish(doc,now)
    doc['members']['B']['confirmedPlanVersion'] = 0
    assert not can_publish(doc,now)
    doc = ready_document()
    doc['members']['B']['submittedAt'] = None
    assert not can_publish(doc,now)
```

- [ ] 실패 확인 후 공개 조건을 구현한다.

```python
def can_publish(doc, now):
    members = [doc['members'].get('A'), doc['members'].get('B')]
    if doc['status']=='closed' or doc['expiresAt']<=now or not all(members):
        return False
    a,b = members
    if a['userId']==b['userId']:
        return False
    return all(m['submittedAt'] is not None
        and m['confirmedPlanVersion']==doc['plan']['version']
        and m['consent']['version']==doc['consentVersion']
        for m in members)
```

  consent가 없으면 false를 반환하도록 안전하게 처리한다. consent에는 허용 범위뿐 아니라 submittedRevision·round도 저장해 현재 값과 비교한다. shareFinance/Values의 false는 공개 범위 축소이지 동의 절차 누락과 다르다.

  submit은 요청 version 일치, 자신의 입력 revision·미제출, 계획 확인, 세션 활성 조건을 하나의 Mongo CAS로 검사한다. 같은 revision·동의로 재시도하면 기존 submitted 응답을 반환하고, 다른 내용의 재제출은409다. 공개 준비 상태는 두 사람의 동일 round와 현재 consent를 다시 확인한다.

  publicationStamp는 round·각 inputRevision·planVersion·question/rule/copy/consentVersion을 canonical JSON으로 직렬화하여 SHA-256한 값이다. DB 문서의 version과 closed 여부를 비교하는 claim에 성공한 스냅샷만 C3로 전달한다.

- [ ] A만 제출, 동의 누락, B 계획 stale, 동시에 PATCH/submit, submit/plan PATCH 경합, 중복 submit을 테스트한다. 상태 응답은 `{status,partnerCompleted,mySubmitted}`만 반환하며 상대 입력·수치·선택 영역은 포함하지 않는다.
- [ ] `feat(deep): enforce dual-consent publication gate` 커밋.

## C3. 템플릿 리포트와 공개 범위

**Files:** Create `apps/backend/deep/report.py`, `config/deep_copy.ko.v1.json`, `tests/unit/test_deep_report.py`, `tests/integration/test_deep_privacy.py`; Modify `deep/repository.py`, `service.py`, `router.py`, `schemas.py`(deep 모듈).

**Interfaces:** `build_report(snapshot:dict) -> dict`, `render_topic(area:str,a:dict,b:dict) -> dict`; repo `store_report(session_id,stamp,report,expires_at) -> str`, `publish_report_pointer(session_id,expected_version,stamp,report_id,now) -> bool`, `load_report_for_member(session_id,user_id,now) -> dict`. API `GET /deep/sessions/{id}/result`.

결과 DTO는 discriminator status로 waiting/ready를 분리한다. waiting은 `{status:'waiting',partnerCompleted:bool}`만 허용한다. ready는 `{status:'ready',report:{versions,cashflow,housing,goal,values,topics,agreementPrompts,limitations}}`다. `participants.input`·자유메모·이메일·provider token 같은 키를 정의하지 않는다.

- [ ] 실패 테스트:

```python
from tests.deep_factory import ready_document
from deep.report import build_report

def test_finance_opt_out_disables_all_financial_derivations():
    doc = ready_document()
    doc['members']['B']['consent']['shareFinance'] = False
    report = build_report(doc)
    assert report['cashflow']['status'] == 'unavailable'
    assert report['housing']['status'] == 'unavailable'
    assert report['goal']['status'] == 'unavailable'
    assert report['limitations']['policyMatching'] == 'unavailable'
    assert 'numericSayDo' not in report
```

- [ ] 실패 확인 후 두 범위를 따로 검사한다.

```python
members = [snapshot['members']['A'],snapshot['members']['B']]
allow_finance = all(m['consent']['shareFinance'] for m in members)
allow_values = all(m['consent']['shareValues'] for m in members)
```

  allow_finance=false이면 B3 금융 함수를 호출하지 않고 cashflow/housing/goal을 unavailable(reason='sharing_not_authorized')로 만든다. allow_values=false이면 가치관 계산·차이 카드도 생략한다. 둘 다 허용일 때만 `analyze_deep`를 통째로 사용할 수 있다. values만 허용이면 B4 함수만 호출한다. 필드별 withheld는 B의 결측 규칙으로 금융 파생값까지 차단한다.

  MVP 대화 템플릿은 다음5개이며 각 observation은 판정문이 아닌 서로의 선택 설명이다. 값의 양극 라벨은 question config에서 가져오고 최종 카피를 코드에 하드코딩하지 않는다.

| area | 열린 질문 | 합의 초안 항목 |
|---|---|---|
| savings | "매달 지키고 싶은 저축액과 조정할 수 있는 지출을 함께 정해볼까요?" | 월 목표·예외 조건 |
| spending | "각자 지키고 싶은 지출과 함께 정할 예산은 무엇인가요?" | 자유지출·경조사비 기준 |
| investment | "이 돈을 사용할 시점과 감수할 수 있는 변화를 함께 이야기해볼까요?" | 돈의 목적·협의할 범위 |
| debt | "대출을 고려할 수 있는 목적과 피하고 싶은 상황은 각각 무엇인가요?" | 조달 방식·재논의 조건 |
| jointManagement | "공동생활에 필요한 정보와 각자의 자유를 어디까지 지키면 좋을까요?" | 분담 방식·정보 공개 범위 |

  모든 차이가0이면 `topics=[]`와 공통기준 질문을 제공한다. 템플릿은 서로 비교 가능한 응답 ID에 근거하고 추정된 개인 결함이나 숫자형 Say-Do를 만들지 않는다. 사용자 메모는 HTML로 출력하지 않으며 상대 결과에 자동 복사하지 않는다.

  deep_reports는 `(sessionId,publicationStamp)` unique, expiresAt TTL. 먼저 immutable report를 `$setOnInsert`로 upsert하고, session의 version/stamp/활성 조건 CAS로 reportId와 ready 상태를 기록한다. CAS 실패 시 세션을 다시 읽는다: 같은 stamp의 승자가 이미 publish했다면 그 결과를 사용하고, 같은 활성 stamp가 아직 처리 중이면 재시도하며 공유 report를 삭제하지 않는다. 세션이 closed거나 stamp가 확실히 폐기된 경우에만 해당 보고서를 정리한다. 철회와 생성이 경합해도 closed 세션에 pointer를 publish하지 않는다. 모든 조회는 세션 상태를 먼저 검사하며 reportId만으로 조회하는 공개 API는 만들지 않는다.

- [ ] waiting 응답의 키 목록 검증, sentinel 비밀값이 결과·로그에 없는지 검사, 금액 opt-out·values opt-out·부분 누락·동일답·LLM 없는 동작·생성/철회 경합 테스트 통과.
- [ ] `feat(deep): deliver privacy-scoped template reports` 커밋.

## C4. 합의·재작성·철회·만료·내부 계정 삭제

**Files:** Create `apps/backend/deep/agreements.py`, `lifecycle.py`, `tests/unit/test_deep_agreements.py`, `tests/integration/test_deep_lifecycle.py`; Modify `deep/router.py`, `repository.py`, `auth/router.py`, `auth/repository.py`.

**Interfaces:** `confirm_agreement(agreement:dict,user_id:str,version:int) -> dict`, `edit_agreement(agreement:dict,expected_version:int,text:str) -> dict`; repo async `propose_agreement(session_id,user_id,payload,now)`, `confirm_agreement(session_id,user_id,agreement_id,expected_version,now)`, `defer_agreement(session_id,user_id,agreement_id,expected_version,now)`, `request_round(session_id,user_id,expected_round,now)`, `withdraw(session_id,user_id,now)`, `delete_account_data(user_id,now)`. 위 저장소 메서드는 갱신된 상태 dict를 반환한다.

API: `GET/POST /deep/sessions/{id}/agreements`, `PATCH /deep/sessions/{id}/agreements/{agreementId}`, `POST .../{agreementId}/confirm`, `POST .../{agreementId}/defer`, `POST /deep/sessions/{id}/rounds`, `POST /deep/sessions/{id}/withdraw`, `DELETE /api/v1/auth/account`.

합의 문서: id,sessionId,round,version,text(max1000),participants:list[userId],confirmations:list[userId],status proposed/agreed/deferred,reviewOn:date|None,expiresAt. 참가자가 아닌 계정은404. 내용 변경은 version 증가·confirmations=[]로 되돌린다.

- [ ] 실패 테스트:

```python
from deep.agreements import confirm_agreement, edit_agreement

def test_agreement_requires_both_and_edit_resets_confirmation():
    item = {'version':1,'text':'공동비를 함께 정한다','participants':['A','B'],
            'confirmations':[],'status':'proposed'}
    item = confirm_agreement(item,'A',1)
    assert item['status']=='proposed'
    item = confirm_agreement(item,'B',1)
    assert item['status']=='agreed'
    item = edit_agreement(item,1,'공동비 기준은 다음 달 다시 정한다')
    assert item['version']==2 and item['confirmations']==[]
```

- [ ] 실패 확인 후 핵심 상태 전이를 구현한다.

```python
from copy import deepcopy

def confirm_agreement(agreement,user_id,version):
    if user_id not in agreement['participants']:
        raise PermissionError('NOT_FOUND')
    if agreement['version']!=version:
        raise ValueError('VERSION_CONFLICT')
    result = deepcopy(agreement)
    result['confirmations'] = sorted(set(result['confirmations'])|{user_id})
    result['status'] = ('agreed' if set(result['confirmations'])==set(result['participants']) else 'proposed')
    return result
```

  실제 DB 확인은 version CAS와 `$addToSet`으로 원자적으로 처리한다. 한번 confirmed 상태에서 텍스트를 바꿔도 기존 agreed를 유지하지 않는다. defer도 version을 올리고 기존 confirmations를 비워 과거 확인이 보류를 덮어쓰지 못하게 한다. 보류는 정상 상태이며 동의 압박이나 자동 알림을 추가하지 않는다.

  새 round는 한 명의 제안만으로 상대 입력을 초기화하지 않는다. 양측이 같은 현재 round에 재작성 요청을 확인하면 원자적으로 round+1, 제출·계획 확인·동의 초기화, 이전 report pointer 폐기한다. 각자의 기존 입력을 자신의 초안으로만 복사한다. 이미 공개된 과거 결과를 새 입력으로 덮어쓰지 않는다.

  withdraw는 먼저 session.status=closed를 원자적으로 기록한 다음 report/agreement를 삭제한다. 이후 캐시·직접 ID·재로그인으로도 공동 결과를 얻지 못한다. 물리 정리 중 실패해도 접근 차단은 유지하며 제한된 대상 ID의 삭제를 재시도한다.

  초안 expiresAt=생성+30일, 공개 시 report/agreement와 세션 expiresAt=최초공개+90일을 같은 기준으로 설정한다. 재조회·폴링은 수명을 연장하지 않는다. TTL 도달 전이라도 API의 시간 비교로 만료 접근을 막는다.

  내부 계정 삭제는 Origin 검사와 최근10분 이내 앱 로그인 확인 후 실행한다. 해당 계정 로그인 세션 전부 폐기, 연결된 공동 세션을 닫고 본인 재무 입력·관련 공동 결과·합의를 삭제한다. 상대의 독립 계정·다른 세션은 삭제하지 않는다. 이는 카카오 계정 삭제나 카카오 서비스 전체 탈퇴가 아님을 명시한다.

- [ ] 만료 직전/정각, callback 새 로그인, withdrawal vs result generation, 계정 삭제 후 다른 사용자 독립 세션 유지, 일부 삭제 실패 시 재조회 불가, round 재작성 양측 확인을 테스트한다.
- [ ] `feat(deep): add agreements and privacy lifecycle` 커밋.

## C5. 실제 Mongo 경쟁·Light 회귀·계약·시험 배포 gate

**Files:** Create `apps/backend/tests/integration/test_deep_mongo.py`, `tests/test_deep_openapi.py`, `tests/fixtures/deep_contract_examples.json`, `docs/operations/deep-mvp-release-checklist.md`; Modify `.github/workflows/backend.yml`, `main.py`, `apps/backend/openapi.json`, `apps/frontend/openapi.json`.

**Interfaces:** fixture `deep_mongo_db`는 `DEEP_TEST_MONGODB_URI`만 읽으며 local loopback 또는 CI service hostname만 허용한다. 데이터베이스 이름은 `mirisalim_deep_test_<uuid>`이며 생성한 정확한 DB만 finally에서 정리한다. `REQUIRE_DEEP_MONGO_TESTS=1`이면 연결 실패/URI 누락은 skip이 아니라 fail이다.

- [ ] 계약 실패 테스트:

```python
from main import app

def test_account_and_light_security_are_distinct():
    app.openapi_schema = None
    schema = app.openapi()
    schemes = schema['components']['securitySchemes']
    assert schemes['cookieAuth']['name']=='mrs_participant'
    assert schemes['accountAuth']['name']=='mrs_account'
    operation = schema['paths']['/api/v1/deep/sessions/{session_id}/result']['get']
    assert operation['security']==[{'accountAuth':[]}]
```

- [ ] 실패 확인 후 A의 `APIKeyCookie(name='mrs_account',scheme_name='accountAuth')` 메타데이터와 실제 require_account를 연결한다. 기존 custom_openapi가 Deep security를 Light security로 덮어쓰지 않게 한다. 명세 문구만 추가하고 인증 실행을 생략해서는 안 된다.

  기존 스크립트는 두 스냅샷을 함께 생성한다. 테스트에서는 test 환경·기능 비활성·외부 URI 없는 상태로 다음을 실행한다.

```powershell
.\.venv\Scripts\python.exe export_openapi.py
.\.venv\Scripts\python.exe scripts/test_local.py -q
.\.venv\Scripts\python.exe -m ruff check .
.\.venv\Scripts\python.exe -m mypy main.py schemas.py services auth deep tests scripts
```

  앱 import 시 Kakao 또는 Mongo 네트워크 호출이 발생하지 않게 한다. snapshots는 직접 편집하지 않고 재생성한다. public deep-v1 보호와 legacy mode 제한 외에 Light operation schema 변경이 없는지 비교한다.

- [ ] CI에 실제 DB job 추가. 아래 service는 테스트 전용이며 운영 Atlas를 사용하지 않는다.

```yaml
deep-mongo:
  runs-on: ubuntu-latest
  services:
    mongodb:
      image: mongo:7
      ports: ['27017:27017']
      options: >-
        --health-cmd "mongosh --quiet --eval 'db.adminCommand({ping:1}).ok'"
        --health-interval 5s --health-timeout 5s --health-retries 12
  env:
    ENVIRONMENT: test
    MONGODB_URI: mongodb://127.0.0.1:27017
    DEEP_TEST_MONGODB_URI: mongodb://127.0.0.1:27017
    REQUIRE_DEEP_MONGO_TESTS: '1'
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-python@v5
      with:
        python-version: '3.11'
    - run: python -m pip install -r apps/backend/requirements.txt
    - run: python -m pytest tests/integration/test_deep_mongo.py tests/integration/test_mongo_concurrency.py -q
      working-directory: apps/backend
```

  새로운 경쟁 테스트는 `asyncio.gather`로 PATCH/submit, plan-edit/submit, 양측 submit, report/withdraw, agreement-edit/confirm, invite/join 두 사용자 경합을 반복한다. 쿼리 조건과 최종 DB 문서를 검사하며 테스트 skip을 통과로 보고하지 않는다. 이 job의 Mongo 버전은 시험용 선택이며 운영 Atlas 버전과의 차이는 출시 점검에서 확인한다.

- [ ] 프론트 팀에 ① 카카오 버튼·callback 복귀 ② own input/revision ③ 공동 계획 확인 ④ waiting/ready/partial/unavailable ⑤ 합의·철회 화면의 fixture와 생성 OpenAPI를 전달한다. 요청·응답 예시에는 테스트용 가짜 금액과 계정만 사용한다.
- [ ] 프론트 담당자와 테스트 계정2개로 브라우저 E2E: Light 정상 → 각각 카카오 로그인 → Deep 초대 → 각자 입력 → 한쪽만 제출 시 잠금 → 양측 확인 후 같은 결과 → 합의 수정 시 재확인 → 철회 후 조회 차단. 서버 응답과 브라우저 storage·공유·콘솔에 민감 데이터가 없는지도 확인한다. 백엔드 단독 테스트 통과를 프론트 E2E 통과로 보고하지 않는다.
- [ ] 품질검사·동시성·OpenAPI·기존 Light 전부 통과 후 `test(deep): verify contracts concurrency and release gates` 커밋.

**배포 handoff:** 시험 환경의 callback·환경 변수·허용 Origin, 카카오 사용자 동의 화면, 보관기간, 기존 legacy deep 세션 유무를 확인한다. 프로덕션 플래그 활성화는 별도 승인 후 수행한다. 이상 시 플래그만 꺼서 Deep 신규 접근을 중단하되 Light와 저장 데이터는 그대로 보존한다. provider 비밀값 누락·계산 실패·DB 장애·잠금 위반은 활성화 중지 사유다.
