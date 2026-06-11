import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Crimson deportivo — más cálido y rico que el rojo puro anterior
        red: {
          50:  "#fff1f2",
          100: "#ffe0e3",
          200: "#ffc0c6",
          300: "#ff8090",
          400: "#ff4060",
          500: "#C41230",  // crimson principal (antes #e81010)
          600: "#A50E28",  // hover
          700: "#820A1F",  // dark
          800: "#5C0617",  // very dark
          900: "#38030E",  // bg tint
          950: "#1E0108",  // deep bg
        },
        // Negros / grises oscuros — ligeramente más cálidos
        ink: {
          50:  "#F5F5F6",
          100: "#E8E8EA",
          200: "#D0D0D4",
          300: "#A8A8B0",
          400: "#78787E",
          500: "#505056",
          600: "#38383E",
          700: "#252529",
          800: "#161619",
          900: "#0F0F11",
          950: "#080809",
        },
      },
      fontFamily: {
        sans:    ["var(--font-jakarta)", "system-ui", "sans-serif"],
        display: ["var(--font-bebas)", "sans-serif"],
        mono:    ["JetBrains Mono", "Fira Code", "monospace"],
      },
      boxShadow: {
        "red-glow": "0 0 24px rgba(196, 18, 48, 0.35)",
        "red-sm":   "0 0 10px rgba(196, 18, 48, 0.25)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "red-gradient": "linear-gradient(135deg, #C41230 0%, #7A0B1E 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
