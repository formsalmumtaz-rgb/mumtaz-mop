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
        // Mumtaz brand palette. Red is the confirmed brand colour (CONTEXT/
        // EXECUTION). Navy + gold are read from the ISG logo and are ASSUMED
        // pending the owner's exact brand hex — tune here in one place.
        brand: {
          DEFAULT: "#A31E22",  // Mumtaz red
          dark: "#7F171A",
          light: "#C64B4E",
          50: "#FBEAEA",
        },
        navy: {
          DEFAULT: "#1C2540",  // ASSUMED — ISG wordmark subtext
          dark: "#10172B",
          light: "#33406A",
        },
        gold: {
          DEFAULT: "#BF9F60",  // ASSUMED — ISG "MUMTAZ" metallic gold
          dark: "#9C7E43",
          light: "#D9C48E",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
