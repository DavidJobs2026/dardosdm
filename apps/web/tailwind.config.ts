import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Rojos
        red: {
          50:  "#fff0f0",
          100: "#ffe0e0",
          200: "#ffc0c0",
          300: "#ff8080",
          400: "#ff4040",
          500: "#e81010",  // rojo principal
          600: "#cc0000",  // hover
          700: "#a30000",  // dark
          800: "#6b0000",  // very dark
          900: "#3d0000",  // bg tint
          950: "#200000",  // deep bg
        },
        // Negros / grises oscuros
        ink: {
          50:  "#f5f5f5",
          100: "#e8e8e8",
          200: "#d0d0d0",
          300: "#a8a8a8",
          400: "#787878",
          500: "#505050",
          600: "#383838",
          700: "#262626",
          800: "#181818",
          900: "#111111",
          950: "#080808",
        },
      },
      fontFamily: {
        sans:    ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        display: ["Bebas Neue", "sans-serif"],
        mono:    ["JetBrains Mono", "Fira Code", "monospace"],
      },
      boxShadow: {
        "red-glow": "0 0 20px rgba(232, 16, 16, 0.3)",
        "red-sm":   "0 0 8px rgba(232, 16, 16, 0.2)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "red-gradient": "linear-gradient(135deg, #cc0000 0%, #7f0000 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
