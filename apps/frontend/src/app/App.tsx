import { useState } from "react";

import { LoginCheck } from "@/pages/login-check";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PillToggle } from "@/shared/ui/pill-toggle";
import { Progress } from "@/shared/ui/progress";
import { AppShell } from "@/widgets/app-shell";

export function App() {
  return window.location.pathname === "/deep/login-check" ? <LoginCheck /> : <Foundation />;
}

function Foundation() {
  const [answerSelected, setAnswerSelected] = useState(true);
  const [predictionSelected, setPredictionSelected] = useState(false);

  return (
    <AppShell>
      <section className="overflow-hidden px-5 py-14 sm:px-8 sm:py-20" id="foundation">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="animate-fadeup">
            <Badge tone="green">3분이면 시작할 수 있어요</Badge>
            <h1 className="mt-5 max-w-2xl text-4xl font-extrabold leading-[1.16] tracking-[-0.04em] text-ink sm:text-6xl">
              돈 이야기를,{" "}
              <br />
              조금 더 편안하게
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
              정답을 맞히는 대신 서로의 생각을 가볍게 예상해보세요. 두 사람이 모두
              답한 뒤에만 결과를 함께 확인할 수 있어요.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button>3분 대화 시작하기</Button>
              <Button variant="secondary">진행 방식 살펴보기</Button>
            </div>
            <ul className="mt-7 grid gap-3 text-sm text-ink-muted sm:grid-cols-3" id="principles">
              {["가입 없이 시작", "7일 후 자동 삭제", "함께 제출 후 공개"].map((item) => (
                <li className="flex items-center gap-2" key={item}>
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-green" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative animate-fadeup [animation-delay:100ms]">
            <div aria-hidden="true" className="absolute -inset-8 -z-10 rounded-full bg-green-tint/70 blur-3xl" />
            <div className="rounded-card border border-border bg-card p-5 sm:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Badge tone="neutral">미리보기</Badge>
                  <h2 className="mt-3 text-xl font-extrabold tracking-[-0.02em]">서로의 생각을 골라보세요</h2>
                </div>
                <img
                  alt=""
                  aria-hidden="true"
                  className="size-16 object-contain"
                  src="/images/미리살림_3분_아이콘.png"
                />
              </div>

              <div className="mt-7 space-y-6">
                <div>
                  <p className="mb-3 text-sm font-bold text-ink">나는 이렇게 생각해요</p>
                  <div className="flex flex-wrap gap-2">
                    <PillToggle pressed={answerSelected} onPressedChange={setAnswerSelected}>
                      계획대로 쓰는 편
                    </PillToggle>
                    <PillToggle pressed={!answerSelected} onPressedChange={() => setAnswerSelected(false)}>
                      필요하면 유연하게
                    </PillToggle>
                  </div>
                </div>

                <div className="rounded-card bg-purple-tint/70 p-4">
                  <p className="mb-3 text-sm font-bold text-purple-strong">
                    상대는 어떻게 생각할까요?
                  </p>
                  <PillToggle
                    pressed={predictionSelected}
                    onPressedChange={setPredictionSelected}
                    tone="purple"
                  >
                    상대의 답을 예상해보기
                  </PillToggle>
                </div>

                <Progress label="대화 준비" max={3} value={1} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
