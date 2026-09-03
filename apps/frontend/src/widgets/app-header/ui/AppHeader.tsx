import { useState } from "react";

import { useWindowWidth } from "@/shared/lib";

const navigationItems = [
  { href: "#about", label: "서비스 소개" },
  { href: "#how", label: "이용 가이드" },
  { href: "#sample", label: "샘플 리포트" },
  { href: "#faq", label: "FAQ" },
] as const;

function LogoMark() {
  return (
    <svg aria-hidden="true" className="size-[30px] shrink-0" fill="none" viewBox="0 0 32 32">
      <path
        d="M6 20a5 5 0 0 1 1.6-9.7A7 7 0 0 1 21 10.6 4.7 4.7 0 0 1 26 15"
        stroke="#43A77B"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path
        d="M10 26v-6.2l6-4.4 6 4.4V26H10z"
        stroke="#43A77B"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path d="M14 26v-3.6h4V26" stroke="#8A6FD1" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

export function AppHeader() {
  const isDesktop = useWindowWidth() >= 900;
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-canvas/[0.92] backdrop-blur-lg [line-height:normal]">
      <div className="mx-auto flex h-[68px] max-h-[70px] max-w-[1200px] items-center gap-6 px-6">
        <a
          aria-label="미리살림 홈"
          className="flex items-center gap-2.5 rounded-lg text-ink focus-visible:shadow-focus"
          href="#top"
        >
          <LogoMark />
          <span className="text-[21px] font-bold tracking-[-0.01em]">미리살림</span>
        </a>

        {isDesktop ? (
          <>
            <nav aria-label="주요 메뉴" className="ml-auto flex items-center gap-9">
              {navigationItems.map(({ href, label }) => (
                <a
                  className="rounded-md text-[15.5px] font-medium text-ink-muted transition-colors duration-[160ms] ease-smooth hover:text-ink focus-visible:shadow-focus"
                  href={href}
                  key={label}
                >
                  {label}
                </a>
              ))}
            </nav>
            <a
              className="inline-flex min-h-[42px] items-center rounded-full border border-border bg-card px-5 text-[15px] font-semibold text-ink transition-colors duration-[160ms] ease-smooth hover:border-green hover:text-green-strong focus-visible:shadow-focus"
              href="#login"
            >
              로그인
            </a>
          </>
        ) : (
          <button
            aria-controls="mobile-navigation"
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            className="ml-auto flex size-11 flex-col items-center justify-center gap-[5px] rounded-xl border border-border bg-transparent focus-visible:shadow-focus"
            onClick={() => setIsMenuOpen((open) => !open)}
            type="button"
          >
            <span aria-hidden="true" className="block h-[1.8px] w-[18px] rounded-sm bg-ink" />
            <span aria-hidden="true" className="block h-[1.8px] w-[18px] rounded-sm bg-ink" />
            <span aria-hidden="true" className="block h-[1.8px] w-[18px] rounded-sm bg-ink" />
          </button>
        )}
      </div>

      {!isDesktop && isMenuOpen ? (
        <nav
          aria-label="주요 메뉴"
          className="border-t border-border bg-card px-6 pb-[18px] pt-2"
          id="mobile-navigation"
        >
          {navigationItems.map(({ href, label }) => (
            <a
              className="flex min-h-12 items-center rounded-md text-base font-medium leading-[normal] text-ink focus-visible:shadow-focus"
              href={href}
              key={label}
              onClick={() => setIsMenuOpen(false)}
            >
              {label}
            </a>
          ))}
          <a
            className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-[14px] border border-border bg-card text-base font-semibold leading-[normal] text-ink transition-colors duration-[160ms] ease-smooth hover:border-green hover:text-green-strong focus-visible:shadow-focus"
            href="#login"
            onClick={() => setIsMenuOpen(false)}
          >
            로그인
          </a>
        </nav>
      ) : null}
    </header>
  );
}
