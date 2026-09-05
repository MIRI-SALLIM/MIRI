import { useEffect, useState, type FormEvent } from "react";
import { DeepCheck } from "./DeepCheck";

type Context = { userId: string; role: "A" | "B"; roomCode: string; expiresAt: string; demo: true };

class RequestError extends Error {
  constructor(readonly status: number) { super("Authentication request failed"); }
}

async function request(path: string, body?: Record<string, string | boolean>): Promise<Context | null> {
  const response = await fetch(`/api/v1/auth/${path}`, {
    method: body ? "POST" : "GET",
    credentials: "same-origin", cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(10000),
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new RequestError(response.status);
  if (response.status === 204) return null;
  const data = await response.json();
  if (!data || typeof data.userId !== "string" || !["A", "B"].includes(data.role)
      || typeof data.roomCode !== "string" || !/^[0-9a-f]{64}$/.test(data.roomCode)
      || typeof data.expiresAt !== "string" || !Number.isFinite(Date.parse(data.expiresAt)) || data.demo !== true) {
    throw new RequestError(502);
  }
  return data as Context;
}

function message(error: unknown) {
  const status = error instanceof RequestError ? error.status : 0;
  if (status === 401) return "아이디·비밀번호·체험방 코드를 확인해 주세요. 만료된 방은 새로 시작하세요.";
  if (status === 403) return "프론트 주소(Origin) 설정을 확인해 주세요.";
  if (status === 404) return "서버의 딥모드·심사용 로그인이 아직 활성화되지 않았습니다.";
  if (status === 429) return "요청이 많습니다. 잠시 후 다시 시도하세요.";
  return "로그인 서버에 연결할 수 없습니다. 서버 상태와 설정을 확인해 주세요.";
}

export function LoginCheck() {
  const [context, setContext] = useState<Context | null>(null);
  const [regularUser, setRegularUser] = useState<string | null>(null);
  const [resetConfirmed, setResetConfirmed] = useState(false);
  const [username, setUsername] = useState("judge-a");
  const [password, setPassword] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    request("reviewer/context").then((data) => { if (active) setContext(data); })
      .catch(async (failure: unknown) => {
        if (failure instanceof RequestError && [403, 404].includes(failure.status)) {
          try {
            const response = await fetch("/api/v1/auth/me", { credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
            if (response.ok) {
              const data = await response.json();
              if (typeof data.userId === "string" && active) { setRegularUser(data.userId); return; }
            }
          } catch { /* Keep the original safe authentication error. */ }
        }
        if (active && !(failure instanceof RequestError && failure.status === 401)) setError(message(failure));
      }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function run(action: "login" | "context" | "logout" | "reset") {
    setBusy(true);
    setError("");
    const body: Record<string, string | boolean> | undefined = action === "login"
      ? { username, password, ...(roomCode.trim() ? { roomCode: roomCode.trim() } : {}) }
      : action === "logout" ? {} : action === "reset" ? { confirm: true } : undefined;
    setPassword("");
    try {
      const result = await request(action === "logout" ? "logout" : `reviewer/${action}`, body);
      setContext(result);
      setRegularUser(null);
      setResetConfirmed(false);
      setRoomCode("");
    } catch (failure) {
      setContext(null);
      setRegularUser(null);
      setRoomCode("");
      setError(message(failure));
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) void run("login");
  }

  const inputStyle = "mt-1 w-full rounded-lg border border-border-control bg-white p-3 text-ink";
  const buttonStyle = "rounded-lg border border-border-control px-4 py-3 font-semibold disabled:opacity-50";
  return (
    <main className="mx-auto max-w-xl space-y-6 px-5 py-10 text-ink">
      <a href="/" className="underline">홈으로</a>
      <h1 className="text-2xl font-bold">로그인 연결 점검</h1>
      <p>완성된 딥모드 화면이 아닌 인증 확인용 페이지입니다. 가상 데이터로 체험하고 실제 개인정보·계좌정보는 입력하지 마세요.</p>
      <p className="text-sm text-ink-muted">로컬 점검 서버의 데이터는 메모리에만 유지되며 서버를 끄면 사라집니다. 운영 Mongo·HTTPS 검증을 대신하지 않습니다.</p>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
      {busy && <p role="status">확인 중…</p>}
      {regularUser ? <section><p>일반 계정 로그인됨</p><button className={buttonStyle} disabled={busy} onClick={() => void run("logout")}>로그아웃</button></section> : context ? (
        <section className="space-y-4 rounded-xl border border-border p-5" aria-label="로그인 정보">
          <h2 className="text-xl font-bold">로그인됨 · {context.role}</h2>
          <p className="break-all text-sm">계정 식별자: {context.userId}</p>
          <label className="block">현재 체험방 코드<input className={inputStyle} readOnly value={context.roomCode} /></label>
          <p className="text-sm">이 코드를 복사해 별도 브라우저·시크릿 창에서 상대 계정으로 로그인하세요. Deep 진단 초대 코드와는 다릅니다.</p>
          <p className="text-sm">만료: {new Date(context.expiresAt).toLocaleString("ko-KR")}</p>
          <div className="flex flex-wrap gap-3">
            <button className={buttonStyle} disabled={busy} onClick={() => void run("context")}>로그인 상태 확인</button>
            <button className={buttonStyle} disabled={busy} onClick={() => void run("logout")}>로그아웃</button>
          </div>
          <label className="block"><input type="checkbox" checked={resetConfirmed} disabled={busy} onChange={e => setResetConfirmed(e.target.checked)} /> 기존 체험방과 두 사람의 로그인·진단을 종료하고 초기화합니다</label>
          <button className={buttonStyle} disabled={busy || !resetConfirmed} onClick={() => void run("reset")}>새 체험방으로 초기화</button>
        </section>
      ) : (
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-border p-5">
          <label className="block">계정<select className={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} disabled={busy}>
            <option value="judge-a">judge-a</option><option value="judge-b">judge-b</option>
          </select></label>
          <label className="block">비밀번호<input className={inputStyle} type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} /></label>
          <label className="block">체험방 코드 (선택)<input className={inputStyle} autoComplete="off" spellCheck={false} pattern="[0-9a-f]{64}" maxLength={64} value={roomCode} onChange={(e) => setRoomCode(e.target.value)} disabled={busy} /></label>
          <p className="text-sm">첫 로그인은 코드를 비우세요. 상대방과 같은 방에 들어갈 때만 입력합니다. 같은 브라우저에서는 마지막으로 로그인한 계정이 사용됩니다.</p>
          <button className={`${buttonStyle} bg-green-strong text-white`} disabled={busy} type="submit">심사용 로그인</button>
        </form>
      )}
      {!busy && (context || regularUser) && <DeepCheck key={context ? `${context.userId}:${context.roomCode}` : regularUser!} />}
      <section className="space-y-2 border-t border-border pt-5">
        <a className={`${buttonStyle} inline-block`} href="/api/v1/auth/kakao/start?returnTo=%2Fdeep%2Flogin-check">카카오 로그인 시작</a>
        <p className="text-sm">키·콜백이 등록된 서버에서만 사용할 수 있습니다. 로컬 메모리 서버는 카카오가 꺼져 있어 404를 반환합니다.</p>
      </section>
    </main>
  );
}
