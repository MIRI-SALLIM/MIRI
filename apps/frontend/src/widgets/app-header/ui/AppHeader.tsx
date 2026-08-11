import { useWindowWidth } from "@/shared/lib";
import { Badge } from "@/shared/ui/badge";

export function AppHeader() {
  const isDesktop = useWindowWidth() >= 900;

  return (
    <header className="sticky top-0 z-20 border-b border-border/80 bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-5 px-5 sm:px-8">
        <a
          aria-label="미리살림 홈"
          className="inline-flex items-center gap-2.5 rounded-lg font-extrabold tracking-[-0.02em] text-ink focus-visible:shadow-focus"
          href="/"
        >
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-xl bg-green text-sm text-ink"
          >
            미
          </span>
          <span>미리살림</span>
        </a>

        {isDesktop ? (
          <nav aria-label="주요 메뉴" className="flex items-center gap-7 text-sm font-semibold">
            <a className="rounded-md text-green-strong focus-visible:shadow-focus" href="#foundation">
              3분 모드
            </a>
            <a className="rounded-md text-ink-muted hover:text-ink focus-visible:shadow-focus" href="#principles">
              함께하는 방법
            </a>
          </nav>
        ) : (
          <Badge tone="green">3분 모드</Badge>
        )}
      </div>
    </header>
  );
}
