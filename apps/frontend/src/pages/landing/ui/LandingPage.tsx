import { StartLightButton } from "@/features/create-session";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

const privacyPromises = [
  "회원가입도 로그인도 없어요",
  "내 답은 둘 다 제출한 뒤에만 열려요",
  "세션이 만료되면 입력한 내용도 사라져요",
];

const steps = [
  {
    description: "질문에 내 답을 고르고 상대의 답도 예측해 봐요.",
    title: "내가 먼저 답해요",
  },
  {
    description: "링크 하나만 보내면 상대가 바로 참여해요.",
    title: "초대 링크를 보내요",
  },
  {
    description: "상대가 제출하면 대기 화면에서 바로 알려드려요.",
    title: "상대가 끝낼 때까지 기다려요",
  },
  {
    description: "둘 다 제출해야 결과가 열려요. 먼저 훔쳐볼 수 없어요.",
    title: "결과를 동시에 열어요",
  },
];

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="mt-0.5 size-5 shrink-0 text-green-strong"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="m4 12.5 5 5 11-11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-7 text-ink-subtle"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <rect height="10" rx="2" width="14" x="5" y="11" />
      <path d="M8.5 11V8a3.5 3.5 0 1 1 7 0v3" strokeLinecap="round" />
    </svg>
  );
}

export function LandingPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-20 px-5 py-14 sm:px-8 sm:py-20">
      <section className="grid animate-fadeup items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col items-start gap-6">
          <Badge tone="green">둘이 함께하는 3분 재무 대화</Badge>

          <h1 className="text-3xl font-extrabold leading-[1.25] tracking-[-0.03em] text-ink sm:text-4xl">
            돈 이야기, 다투기 전에 맞춰봐요
          </h1>

          <p className="max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
            각자 조용히 답하고, 둘 다 끝내면 결과가 동시에 열려요. 누가 맞고 틀렸는지가 아니라 서로
            어디가 다른지를 확인하는 3분이에요.
          </p>

          <ul aria-label="개인정보 약속" className="flex flex-col gap-3">
            {privacyPromises.map((promise) => (
              <li className="flex items-start gap-2.5 text-sm font-semibold text-ink" key={promise}>
                <CheckIcon />
                <span>{promise}</span>
              </li>
            ))}
          </ul>

          <a
            className="inline-flex min-h-12 items-center rounded-control border border-border bg-card px-5 py-3 text-base font-bold text-ink transition-colors hover:border-green/50 focus-visible:shadow-focus"
            href="#foundation"
          >
            3분 모드 살펴보기
          </a>
        </div>

        <img
          alt="이야기를 나누는 두 사람 일러스트"
          className="w-full rounded-card border border-border bg-card object-cover object-center"
          height={420}
          src="/images/미리살림_사람.png"
          width={520}
        />
      </section>

      <section aria-labelledby="modes-title" className="flex flex-col gap-6" id="foundation">
        <h2
          className="text-2xl font-extrabold tracking-[-0.02em] text-ink sm:text-3xl"
          id="modes-title"
        >
          두 가지 모드
        </h2>

        <div className="grid gap-5 md:grid-cols-2">
          <article className="flex flex-col gap-4 rounded-card border border-green/40 bg-green-tint/40 p-6 sm:p-8">
            <img
              alt="3분 모드 아이콘"
              className="size-14 object-contain"
              height={56}
              src="/images/미리살림_3분_아이콘.png"
              width={56}
            />
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-extrabold tracking-[-0.02em] text-ink">3분 모드</h3>
              <Badge tone="green">3분</Badge>
            </div>
            <p className="flex-1 text-sm leading-relaxed text-ink-muted">
              짧은 질문 몇 개로 서로의 돈 감각을 빠르게 맞춰봐요. 금액을 적지 않아도 괜찮아요.
            </p>
            <StartLightButton />
          </article>

          <article className="flex flex-col gap-4 rounded-card border border-border bg-card p-6 sm:p-8">
            <LockIcon />
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-extrabold tracking-[-0.02em] text-ink">15분 모드</h3>
              <Badge tone="purple">15분</Badge>
            </div>
            <p className="flex-1 text-sm leading-relaxed text-ink-muted">
              수입과 지출, 목표까지 자세히 들여다보는 모드예요. 지금은 준비하고 있어요.
            </p>
            <Button disabled fullWidth variant="secondary">
              준비 중
            </Button>
          </article>
        </div>
      </section>

      <section aria-labelledby="steps-title" className="flex flex-col gap-6" id="principles">
        <h2
          className="text-2xl font-extrabold tracking-[-0.02em] text-ink sm:text-3xl"
          id="steps-title"
        >
          함께하는 방법
        </h2>

        <ol aria-label="함께하는 방법 4단계" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li
              className="flex flex-col gap-3 rounded-card border border-border bg-card p-6"
              key={step.title}
            >
              <span
                aria-hidden="true"
                className="grid size-9 place-items-center rounded-full bg-green-tint text-sm font-extrabold text-green-strong"
              >
                {index + 1}
              </span>
              <h3 className="text-base font-extrabold tracking-[-0.02em] text-ink">{step.title}</h3>
              <p className="text-sm leading-relaxed text-ink-muted">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
