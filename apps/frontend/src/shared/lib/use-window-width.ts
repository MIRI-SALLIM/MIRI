import { useEffect, useState } from "react";

function readWindowWidth() {
  return typeof window === "undefined" ? 0 : window.innerWidth;
}

export function useWindowWidth() {
  const [windowWidth, setWindowWidth] = useState(readWindowWidth);

  useEffect(() => {
    const updateWindowWidth = () => setWindowWidth(readWindowWidth());

    window.addEventListener("resize", updateWindowWidth);
    return () => window.removeEventListener("resize", updateWindowWidth);
  }, []);

  return windowWidth;
}
