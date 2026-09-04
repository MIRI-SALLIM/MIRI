export function RouteLoadingFallback() {
  return (
    <div aria-live="polite" className="grid min-h-40 place-items-center px-5 py-10" role="status">
      화면을 불러오는 중이에요.
    </div>
  );
}
