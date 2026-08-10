import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#FCFCFB",
        card: "#FFFFFF",
        ink: {
          DEFAULT: "#222222",
          muted: "#666666",
          subtle: "#999999",
        },
        border: "#E8E8E8",
        green: {
          DEFAULT: "#43A77B",
          strong: "#237A56",
          tint: "#EAF7F1",
        },
        purple: {
          DEFAULT: "#8A6FD1",
          strong: "#6848AE",
          tint: "#F1EDFC",
        },
      },
      borderRadius: {
        card: "20px",
        control: "14px",
      },
      boxShadow: {
        focus: "0 0 0 3px rgb(67 167 123 / 28%)",
      },
      keyframes: {
        fadeup: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeup: "fadeup 420ms ease-out both",
      },
      fontFamily: {
        sans: ["Pretendard Variable", "Pretendard", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
