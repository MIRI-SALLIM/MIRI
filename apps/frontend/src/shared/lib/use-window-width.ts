import { useEffect, useState } from "react";

function readWindowWidth() {
  return typeof window === "undefined" ? 0 : window.innerWidth;
}

export function useWindowWidth() {
  const [windowWidth, setWindowWidth] = useState(readWindowWidth);

  useEffect(() => {
    const updateWindowWidth = () => setWindowWidth(readWindowWidth());

    window.addEventListener("resize", updateWindowWidth);
    // 렌더와 리스너 등록 사이에 발생한 resize를 놓치지 않도록 현재 폭을 다시 읽는다.
    updateWindowWidth();
    return () => window.removeEventListener("resize", updateWindowWidth);
  }, []);

  return windowWidth;
}
