const footerLinks = [
  { href: "#terms", label: "이용약관" },
  { href: "#privacy", label: "개인정보처리방침" },
  { href: "#faq", label: "FAQ" },
];

export function AppFooter() {
  return (
    // 좁은 화면에서 두 줄로 감겨도 70px 를 넘지 않도록 세로 여백을 줄인다.
    <footer className="max-h-[70px] border-t border-border bg-card [line-height:normal]">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-x-7 gap-y-1.5 px-6 py-[13px] min-[720px]:gap-y-3.5 min-[720px]:py-[26px]">
        <p className="text-sm leading-[normal] text-ink-muted">© 2026 미리살림. All rights reserved.</p>
        <nav aria-label="푸터 메뉴" className="flex items-center gap-[26px]">
          {footerLinks.map(({ href, label }) => (
            <a
              className="rounded-md text-sm leading-[normal] text-ink-muted transition-colors duration-[160ms] ease-smooth hover:text-ink focus-visible:shadow-focus"
              href={href}
              key={label}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
