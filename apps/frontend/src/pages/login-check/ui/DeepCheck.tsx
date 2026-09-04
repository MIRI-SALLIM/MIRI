import { useState } from "react";
import type { components } from "../../../shared/api";
import { ApiError, deepRequest } from "../api";
import sample from "../sample.json";

type Own = components["schemas"]["OwnInputV3"];
type Plan = components["schemas"]["PlanResponseV3"];
type Meeting = components["schemas"]["OwnMeeting"];
type Explanation = components["schemas"]["AvailableExplanation"];
type Session = { id: string; invitationCode?: string; role?: string };
const button = "rounded-lg border border-border px-3 py-2 disabled:opacity-40";
const input = "block w-full rounded border border-border p-2";

export function DeepCheck() {
  const [session, setSession] = useState<Session | null>(null);
  const [code, setCode] = useState("");
  const [restoreId, setRestoreId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [share, setShare] = useState(false);
  const [partner, setPartner] = useState(false);
  const [ai, setAi] = useState(false);
  const [paid, setPaid] = useState(false);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [meaning, setMeaning] = useState("unknown");
  const [ceiling, setCeiling] = useState("");
  const [report, setReport] = useState<unknown>(null);
  const [explanation, setExplanation] = useState<Explanation | { status: "waiting" } | null>(null);
  const path = (suffix: string) => `sessions/${encodeURIComponent(session!.id)}/${suffix}`;
  function clearOutputs() { setReport(null); setExplanation(null); }
  function clearConsent() { setPartner(false); setAi(false); setPaid(false); }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setMessage(""); clearOutputs();
    try { await action(); }
    catch (failure) {
      setMeeting(null); clearConsent(); setShare(false);
      const status = failure instanceof ApiError ? failure.status : 0;
      setError(status === 409 ? "내용이 바뀌었습니다. 새로 조회한 뒤 다시 시도하세요."
        : `요청 실패 (${status || "연결 오류"}). 로그인·동의·서버 설정을 확인하세요. 자동 재시도하지 않습니다.`);
      if ([401, 403, 404, 410].includes(status)) setSession(null);
    } finally { setBusy(false); }
  }
  function enter(next: Session) {
    setSession(next); setCode(""); setRestoreId(""); setMeeting(null);
    setShare(false); clearConsent(); setMeaning("unknown"); setCeiling("");
  }
  async function latestMeeting() { return deepRequest<Meeting>(path("meeting/me")); }
  function version(own: Meeting) {
    return { expectedRound: own.round, planVersion: own.planVersion, expectedRevision: own.revision };
  }
  return <section className="space-y-4 border-t pt-5" aria-label="딥모드 연결 점검">
    <h2 className="text-xl font-bold">딥모드 연결 점검 · 합성 데이터 전용</h2>
    <p>실제 입력을 덮어쓰는 편집기가 아닙니다. 새 테스트 진단에서만 사용하세요. 자동 조회·AI 호출은 하지 않습니다.</p>
    <fieldset disabled={busy} className="space-y-3">
      <button className={button} onClick={() => void run(async () => enter(await deepRequest<Session>("sessions", "POST", {})))}>진단 만들기</button>
      <label className="block">진단 초대 코드<input className={input} value={code} onChange={e => setCode(e.target.value)} autoComplete="off" /></label>
      <button className={button} disabled={!code.trim()} onClick={() => void run(async () => enter(await deepRequest<Session>(`invitations/${encodeURIComponent(code.trim())}/join`, "POST", {})))}>초대로 참여</button>
      <label className="block">기존 진단 ID<input className={input} value={restoreId} onChange={e => setRestoreId(e.target.value)} autoComplete="off" /></label>
      <button className={button} disabled={!restoreId.trim()} onClick={() => void run(async () => {
        await deepRequest(`sessions/${encodeURIComponent(restoreId.trim())}/status`); enter({ id: restoreId.trim() });
      })}>기존 진단 열기</button>
    </fieldset>
    {session && <fieldset disabled={busy} className="space-y-4">
      <label className="block">현재 진단 ID<input className={input} readOnly value={session.id} /></label>
      {session.invitationCode && <label className="block">상대에게 줄 진단 초대 코드<input className={input} readOnly value={session.invitationCode} /></label>}
      <p>① 최초 한 명만 공동 계획 저장 → ② 각자 내 입력 저장 → ③ 각자 계획 확인·공유 동의·제출</p>
      <p>샘플: 공동 예산 월 200만 원 / 각자 제안 80만 원 / 상대 기대 120만 원. 예상 부족분 40만 원.</p>
      <button className={button} onClick={() => void run(async () => {
        const current = await deepRequest<Plan>(path("plan"));
        await deepRequest(path("plan"), "PATCH", { expectedVersion: current.version, plan: sample.plan });
        setMessage("샘플 공동 계획 저장됨. 두 사람 모두 확인해야 합니다.");
      })}>샘플 공동 계획 저장 (최초 1회)</button>{" "}
      <button className={button} onClick={() => void run(async () => {
        const current = await deepRequest<Own>(path("me/input"));
        await deepRequest(path("me/input"), "PATCH", { expectedRevision: current.revision, input: sample.input });
        setMessage("내 샘플 입력 저장됨");
      })}>내 샘플 입력 저장</button>
      <button className={button} onClick={() => void run(async () => {
        const current = await deepRequest<Plan>(path("plan"));
        setReport(current);
      })}>공동 계획 조회</button>{" "}
      <button className={button} onClick={() => void run(async () => {
        const current = await deepRequest<Plan>(path("plan"));
        await deepRequest(path("plan/confirm"), "POST", { planVersion: current.version }); setMessage("공동 계획 확인됨");
      })}>공동 계획 확인</button>
      <label className="block"><input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} /> 재무·가치관 공유 동의</label>
      <p className="text-sm">현재 샘플의 재무·가치관 답변을 공동 결과에 사용하고 상대방에게 공유하는 데 동의합니다. 제출 뒤 수정은 새 라운드가 필요합니다.</p>
      <button className={button} disabled={!share} onClick={() => void run(async () => {
        const own = await deepRequest<Own>(path("me/input")); const plan = await deepRequest<Plan>(path("plan"));
        await deepRequest(path("me/submit"), "POST", { expectedRevision: own.revision, planVersion: plan.version,
          consentVersion: "deep-sharing-v2", shareFinance: true, shareValues: true }); setMessage("내 제출 완료");
      })}>동의하고 내 입력 제출</button>{" "}
      <button className={button} onClick={() => void run(async () => setReport(await deepRequest(path("result"))))}>공동 리포트 조회</button>
      <hr /><h3 className="font-bold">추가 질문과 해설</h3>
      <button className={button} onClick={() => void run(async () => {
        const own = await latestMeeting(); setMeeting(own); clearConsent();
        setMeaning(own.answers?.contributionMeaning ?? "unknown"); setCeiling(own.answers?.adjustableMonthlyWon?.toString() ?? "");
      })}>추가 질문 불러오기</button>
      {meeting && <div className="space-y-3">
        {meeting.questions.map(q => <div key={q.id}><p>{q.text}</p><p className="text-sm">{q.helpText}</p></div>)}
        <label className="block">내 분담액의 의미<select className={input} value={meaning} onChange={e => { setMeaning(e.target.value); setCeiling(""); clearConsent(); }}>
          <option value="unknown">아직 정하지 못했어요</option><option value="initialProposal">우선 제안한 금액이에요</option><option value="selfReportedLimit">현재 제가 제시할 수 있는 상한이에요</option>
        </select></label>
        {meaning === "initialProposal" && <label className="block">제시 가능한 월 상한 (원, 선택)<input className={input} type="number" min="800000" step="1" value={ceiling} onChange={e => { setCeiling(e.target.value); clearConsent(); }} /></label>}
        <button className={button} onClick={() => void run(async () => {
          const own = await latestMeeting();
          const saved = await deepRequest<Meeting>(path("meeting/me"), "PATCH", { ...version(own), answers: {
            contributionMeaning: meaning, adjustableMonthlyWon: meaning === "initialProposal" && ceiling !== "" ? Number(ceiling) : null } });
          setMeeting(saved); clearConsent(); setMessage("추가 답변 저장됨. 수정했으므로 다시 동의하세요.");
        })}>추가 답변 저장</button>
        <p>{meeting.consentNotice}</p>
        <label className="block"><input type="checkbox" checked={partner} onChange={e => { setPartner(e.target.checked); if (!e.target.checked) setAi(false); }} /> 추가 답변 상대 공유 동의</label>
        <label className="block"><input type="checkbox" checked={ai} disabled={!partner} onChange={e => setAi(e.target.checked)} /> AI 처리 동의</label>
        <button className={button} disabled={!partner} onClick={() => void run(async () => {
          const own = await latestMeeting(); setMeeting(await deepRequest<Meeting>(path("meeting/me/consent"), "POST", {
            ...version(own), consentVersion: own.consentVersion, shareWithPartner: partner, allowAiProcessing: ai })); setMessage("해설 동의 저장됨");
        })}>해설 동의 저장</button>
      </div>}
      <button className={button} onClick={() => void run(async () => setExplanation(await deepRequest(path("meeting/explanation"))))}>해설 조회 (생성 안 함)</button>{" "}
      <button className={button} onClick={() => void run(async () => {
        clearConsent(); setMeeting(null); await deepRequest(path("meeting/me/consent"), "DELETE"); setMessage("해설 동의 철회됨");
      })}>해설 동의 철회</button>
      <label className="block"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} /> 유료 AI 요청 가능성을 이해했습니다</label>
      <p className="text-sm">로컬 메모리 서버는 AI가 꺼져 있어 기본 해설만 반환합니다. 운영 서버에 연결하면 비용이 발생할 수 있습니다.</p>
      <button className={button} disabled={!paid} onClick={() => void run(async () => {
        setPaid(false); setExplanation(await deepRequest(path("meeting/explanation"), "POST"));
      })}>AI 생성 요청</button>
    </fieldset>}
    {busy && <p role="status">요청 중…</p>}
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
    {report != null && <div><h3>서버 응답 · 공동 계획/리포트</h3><pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(report, null, 2)}</pre></div>}
    {explanation && (explanation.status === "waiting" ? <p>두 사람의 제출·추가 답변·동의를 기다리고 있습니다.</p> : <div className="space-y-3">
      <h3>해설 출처: {explanation.source === "ai" ? "AI" : "기본 템플릿"} ({explanation.reason ?? "생성 완료"})</h3>
      {explanation.brief.facts.map(f => <p key={f.id}>{f.id}: {f.valueWon.toLocaleString("ko-KR")}원</p>)}
      {explanation.cards.map(c => <article key={c.issueId} className="rounded border p-3"><p>{c.explanation}</p><p className="font-semibold">{c.question}</p></article>)}
    </div>)}
  </section>;
}
