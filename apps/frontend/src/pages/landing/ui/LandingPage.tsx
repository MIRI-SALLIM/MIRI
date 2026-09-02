import type { ReactNode } from "react";

import { StartLightButton } from "@/features/create-session";
import { Button } from "@/shared/ui/button";

const GREEN = "#43A77B";
const PURPLE = "#8A6FD1";

// 이 화면은 레퍼런스(미리살림 오프라인.html)의 랜딩을 그대로 옮긴 것이다.
// 치수·간격·색은 모두 레퍼런스 값이며 임의로 바꾸지 않는다.
const heroPoints = [
  {
    icon: (
      <>
        <circle cx="9" cy="8" r="3.2" stroke={GREEN} strokeWidth="1.7" />
        <path
          d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"
          stroke={GREEN}
          strokeLinecap="round"
          strokeWidth="1.7"
        />
        <path
          d="M16 6.2a3 3 0 0 1 0 5.6M17.5 14.4c2 .7 3.2 2.4 3.2 4.6"
          stroke={PURPLE}
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      </>
    ),
    text: "초대 코드로 2인 참여",
  },
  {
    icon: (
      <>
        <rect height="9.5" rx="2.4" stroke={PURPLE} strokeWidth="1.7" width="15" x="4.5" y="10.5" />
        <path
          d="M8 10.5V8a4 4 0 1 1 8 0v2.5"
          stroke={PURPLE}
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      </>
    ),
    text: "입력 전까지 서로의 정보 비공개",
  },
  {
    icon: (
      <>
        <circle cx="12" cy="12" r="8.4" stroke={GREEN} strokeWidth="1.7" />
        <path
          d="M8.4 12.2l2.6 2.5 4.7-5"
          stroke={GREEN}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </>
    ),
    text: "모든 데이터는 7일 후 자동 삭제",
  },
];

const steps = [
  {
    desc1: "초대 코드를 만들고",
    desc2: "상대에게 공유해요",
    icon: [
      "M9.5 11a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z",
      "M3 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6",
      "M16.5 5.4a3 3 0 0 1 0 5.6",
      "M18.5 14.4c2 .8 3.2 2.5 3.2 4.6",
    ],
    title: "1. 세션 생성",
    tone: "green",
    withArrow: true,
  },
  {
    desc1: "각자 정보를 입력해요",
    desc2: "상대의 답은 보이지 않아요",
    icon: ["M4 20l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.2 19H4z", "M14 7l3 3"],
    title: "2. 함께 입력",
    tone: "purple",
    withArrow: true,
  },
  {
    desc1: "둘 다 완료해야",
    desc2: "결과를 볼 수 있어요",
    icon: ["M5 11h14v9.5H5z", "M8.2 11V7.8a3.8 3.8 0 1 1 7.6 0V11"],
    title: "3. 동시 공개",
    tone: "green",
    withArrow: true,
  },
  {
    desc1: "같은 자료를 보며",
    desc2: "대화를 시작해요",
    icon: ["M4 20h16", "M7 20v-6", "M12 20V8", "M17 20v-9"],
    title: "4. 함께 이해",
    tone: "purple",
    withArrow: false,
  },
] as const;

const lightPoints = [
  "구간 선택으로 간단하게",
  "상호 예측으로 서로 이해도 확인",
  "재무 성향 유형과 저축여력 추정",
];

const deepPoints = [
  "정확한 금액으로 꼼꼼하게",
  "합가 후 월 현금흐름 시뮬레이션",
  "활용 가능한 정책금융까지",
];

function CardCheck({ tone }: { tone: "green" | "purple" }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-[19px] shrink-0 items-center justify-center rounded-full ${
        tone === "green" ? "bg-green-strong" : "bg-purple-strong"
      }`}
    >
      <svg fill="none" height="11" viewBox="0 0 24 24" width="11">
        <path
          d="M6 12.5l4 4 8-9"
          stroke="#FFFFFF"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
      </svg>
    </span>
  );
}

/** 15분 카드 일러스트. 레퍼런스의 properArt를 그대로 옮겼다. */
function DeepModeArt() {
  return (
    <svg
      aria-hidden="true"
      className="h-auto w-full min-w-[84px] max-w-[156px]"
      fill="none"
      viewBox="0 0 168 132"
    >
      <rect
        fill="#FFFFFF"
        height="104"
        rx="9"
        stroke={PURPLE}
        strokeWidth="2"
        width="96"
        x="26"
        y="14"
      />
      <rect
        fill="#F1EDFC"
        height="15"
        rx="5"
        stroke={PURPLE}
        strokeWidth="2"
        width="28"
        x="60"
        y="6"
      />
      <circle cx="51" cy="45" fill="#F1EDFC" r="15" stroke={PURPLE} strokeWidth="2" />
      <path d="M51 45V30a15 15 0 0 1 13 7.5z" fill={PURPLE} />
      <path d="M75 36h34M75 46h28M75 56h34" stroke="#DDD8EE" strokeLinecap="round" strokeWidth="3" />
      <path
        d="M44 100V84M60 100V72M76 100V78M92 100V66M108 100V88"
        stroke={PURPLE}
        strokeLinecap="round"
        strokeWidth="7"
      />
      <path d="M38 104h76" stroke="#DDD8EE" strokeLinecap="round" strokeWidth="2" />
      <rect
        fill="#FFFFFF"
        height="62"
        rx="8"
        stroke={PURPLE}
        strokeWidth="2"
        width="48"
        x="112"
        y="62"
      />
      <rect fill="#F1EDFC" height="13" rx="3" width="34" x="119" y="69" />
      <path
        d="M122 92h.5M136 92h.5M150 92h.5M122 103h.5M136 103h.5M150 103h.5M122 114h.5M136 114h.5M150 114h.5"
        stroke={PURPLE}
        strokeLinecap="round"
        strokeWidth="6"
      />
    </svg>
  );
}

interface ModeCardProps {
  art: ReactNode;
  cta: ReactNode;
  points: readonly string[];
  subtitle: string;
  time: string;
  title: string;
  tone: "green" | "purple";
}

function ModeCard({ art, cta, points, subtitle, time, title, tone }: ModeCardProps) {
  const isGreen = tone === "green";

  return (
    // 호버 영역은 이 래퍼가 잡는다. 카드가 떠오를 때 히트 영역이 같이 움직여
    // 아래쪽 가장자리에서 호버가 깜빡이는 것을 막는다.
    <div className="group h-full">
      <article
        className={`flex h-full flex-col rounded-[22px] border border-border bg-card px-[clamp(24px,2.4vw,32px)] pb-[clamp(14px,1.71vh,30px)] pt-[clamp(14px,1.83vh,32px)] shadow-[0_0_0_0_rgb(34_34_34_/_0%)] transition-[translate,transform,border-color,box-shadow] duration-[220ms] ease-smooth group-hover:-translate-y-[3px] group-hover:shadow-[0_10px_24px_-12px_rgb(34_34_34_/_18%)] ${
          isGreen ? "group-hover:border-green" : "group-hover:border-purple"
        }`}
      >
      <div className="flex items-start justify-between gap-[18px]">
        <div className="min-w-0 flex-auto">
          <span
            className={`inline-block rounded-full px-3 py-[5px] text-[13px] font-semibold ${
              isGreen ? "bg-green-tint text-green-strong" : "bg-purple-tint text-purple-strong"
            }`}
          >
            {time}
          </span>
          <h2
            className={`mt-3.5 whitespace-nowrap text-[clamp(22px,1.9vw,26px)] font-extrabold tracking-[-0.02em] ${
              isGreen ? "text-green-strong" : "text-purple-strong"
            }`}
          >
            {title}
          </h2>
          <p className="mt-2 whitespace-nowrap text-[clamp(14.5px,1.2vw,16px)] text-ink-muted">
            {subtitle}
          </p>
        </div>
        <div className="flex h-[132px] min-w-0 shrink items-center justify-end opacity-95">
          {art}
        </div>
      </div>

      <div className="mb-[clamp(8px,1.03vh,18px)] mt-[clamp(10px,1.26vh,22px)] h-px bg-border-soft" />

      <ul className="mb-[clamp(12px,1.48vh,26px)] flex flex-col gap-[clamp(6px,0.69vh,12px)]">
        {points.map((point) => (
          <li className="flex items-center gap-2.5 text-[15.5px] text-ink" key={point}>
            <CardCheck tone={tone} />
            {point}
          </li>
        ))}
      </ul>

        {cta}
      </article>
    </div>
  );
}

const ctaClassName =
  "mt-auto !min-h-14 !gap-2.5 !rounded-[14px] !border-transparent !px-5 !py-0 !text-[17px] !font-bold !tracking-[-0.01em] !text-white";

function CtaArrow() {
  return (
    <span aria-hidden="true" className="text-[18px]">
      →
    </span>
  );
}

export function LandingPage() {
  return (
    // 레퍼런스는 line-height 를 지정하지 않는다. Tailwind preflight 의 1.5 를 되돌린다.
    <div className="mx-auto w-full max-w-[1200px] px-6 [line-height:normal]" id="top">
      <section
        aria-labelledby="hero-title"
        className="grid animate-fadeup grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-center gap-10 pb-[clamp(14px,2.51vh,44px)] pt-[clamp(16px,3.2vh,56px)]"
        id="about"
      >
        <div>
          <p className="mb-[clamp(10px,1.03vh,18px)] text-base font-semibold leading-[normal] tracking-[-0.01em] text-green-strong">
            결혼은 나중에, 살림은 미리
          </p>
          <h1
            className="text-[clamp(32px,4.2vw,52px)] font-extrabold leading-[1.26] tracking-[-0.02em] text-ink [text-wrap:pretty]"
            id="hero-title"
          >
            서로의 돈을 이해하면
            <br />
            {/* 줄 시작 공백은 렌더링에서 제거된다. 접근성 이름의 단어 경계를 위해 둔다. */}{" "}
            <span className="text-green-strong">미래</span>가 더 선명해져요
          </h1>
          <p className="mt-[clamp(12px,1.26vh,22px)] text-[clamp(15.5px,1.3vw,17.5px)] leading-[1.7] text-ink-muted">
            두 사람이 함께 살기 전에,
            <br />
            서로의 재무를 알아가는 두 가지 방법을 선택해보세요.
          </p>
          <ul
            aria-label="개인정보 안내"
            className="mt-[clamp(14px,1.37vh,28px)] flex flex-wrap items-center gap-x-7 gap-y-[clamp(8px,0.69vh,12px)]"
          >
            {heroPoints.map(({ icon, text }) => (
              <li className="flex items-center gap-2 text-[14.5px] text-ink-muted" key={text}>
                <svg
                  aria-hidden="true"
                  className="shrink-0"
                  fill="none"
                  height="17"
                  viewBox="0 0 24 24"
                  width="17"
                >
                  {icon}
                </svg>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex aspect-[560/400] w-full max-w-[min(680px,72vh)] justify-center overflow-hidden rounded-2xl">
          <img
            alt="노트북을 함께 보고 있는 커플 일러스트"
            className="block h-full w-full scale-[1.18] object-cover object-center"
            height={400}
            src="/images/미리살림_사람.png"
            width={560}
          />
        </div>
      </section>

      <section
        aria-label="두 가지 모드 선택"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-stretch gap-6 pb-[clamp(18px,3.66vh,64px)]"
      >
        <ModeCard
          art={
            <img
              alt=""
              className="block h-auto w-full min-w-[130px] max-w-[240px]"
              src="/images/미리살림_3분_아이콘.png"
            />
          }
          cta={
            <StartLightButton
              className={`${ctaClassName} !bg-green-strong hover:!brightness-[.94] active:!translate-y-px`}
              label={
                <>
                  가볍게 맞춰보기 시작하기
                  <CtaArrow />
                </>
              }
            />
          }
          points={lightPoints}
          subtitle="우리는 서로를 얼마나 알고 있나"
          time="3분"
          title="가볍게 맞춰보기"
          tone="green"
        />

        <ModeCard
          art={<DeepModeArt />}
          cta={
            <Button className={`${ctaClassName} !bg-purple-strong`} disabled fullWidth>
              제대로 계산해보기 시작하기
              <CtaArrow />
            </Button>
          }
          points={deepPoints}
          subtitle="우리 숫자를 합치면 어떻게 되나"
          time="15분"
          title="제대로 계산해보기"
          tone="purple"
        />
      </section>

      <section aria-labelledby="how-title" className="pb-[clamp(18px,4.11vh,72px)]" id="how">
        <h2
          className="mb-[clamp(12px,1.48vh,26px)] text-[22px] font-bold leading-[normal] tracking-[-0.01em] text-ink"
          id="how-title"
        >
          이용 방법
        </h2>
        <ol
          aria-label="이용 방법"
          className="grid grid-cols-[repeat(auto-fit,minmax(252px,1fr))] gap-x-3 gap-y-[clamp(12px,1.37vh,24px)]"
        >
          {steps.map(({ desc1, desc2, icon, title, tone, withArrow }) => (
            <li className="flex items-center gap-4" key={title}>
              <div
                className={`flex size-[58px] shrink-0 items-center justify-center rounded-[17px] ${
                  tone === "green" ? "bg-green-tint" : "bg-purple-tint"
                }`}
              >
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="28"
                  stroke={tone === "green" ? GREEN : PURPLE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                  viewBox="0 0 24 24"
                  width="28"
                >
                  {icon.map((d) => (
                    <path d={d} key={d} />
                  ))}
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold leading-[normal] text-ink">{title}</p>
                <p className="mt-1.5 text-sm leading-[1.6] text-ink-muted">{desc1}</p>
                <p className="text-sm leading-[1.6] text-ink-muted">{desc2}</p>
              </div>
              {withArrow ? (
                <span
                  aria-hidden="true"
                  className="ml-auto pl-2 text-xl leading-[normal] text-arrow"
                >
                  ›
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
