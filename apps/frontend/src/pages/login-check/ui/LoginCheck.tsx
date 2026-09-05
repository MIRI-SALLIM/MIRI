import { useEffect, useState } from "react";
import { DeepCheck } from "./DeepCheck";

type Account = { userId: string };

async function getAccount(): Promise<Account | null> {
  const response = await fetch("/api/v1/auth/me", {
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Authentication request failed");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("userId" in data) || typeof data.userId !== "string") {
    throw new Error("Invalid authentication response");
  }
  return { userId: data.userId };
}

export function LoginCheck() {
  const [account, setAccount] = useState<Account | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getAccount()
      .then((result) => { if (active) setAccount(result); })
      .catch(() => { if (active) setError("로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function logout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Logout request failed");
      setAccount(null);
    } catch {
      setError("로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const buttonStyle = "rounded-lg border border-border-control px-4 py-3 font-semibold disabled:opacity-50";
  return (
    <main className="mx-auto max-w-xl space-y-6 px-5 py-10 text-ink">
      <a href="/" className="underline">홈으로</a>
      <h1 className="text-2xl font-bold">카카오 로그인</h1>
      <p>두 사람이 각자의 카카오 계정으로 로그인한 뒤 돈의 기준을 함께 만들어갑니다.</p>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
      {busy && <p role="status">확인 중…</p>}
      {!busy && !account && (
        <section className="space-y-2 border-t border-border pt-5">
          <a className={`${buttonStyle} inline-block`} href="/api/v1/auth/kakao/start?returnTo=%2Fdeep%2Flogin-check">카카오 로그인 시작</a>
          <p className="text-sm text-ink-muted">로그인 후 각자의 답변은 상대방에게 바로 공개되지 않습니다.</p>
        </section>
      )}
      {!busy && account && (
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <p>일반 계정 로그인됨</p>
            <button className={buttonStyle} disabled={busy} onClick={() => void logout()}>로그아웃</button>
          </div>
          <DeepCheck key={account.userId} />
        </section>
      )}
    </main>
  );
}
