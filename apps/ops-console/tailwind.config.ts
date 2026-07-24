import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Mumtaz brand red (CONTEXT/EXECUTION)
        brand: { DEFAULT: "#A31E22", dark: "#7f171a" },
      },
    },
  },
  plugins: [],
} satisfies Config;
