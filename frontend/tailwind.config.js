/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FFF8EE",
        mint: "#DDF2E6",
        peach: "#FFD9C7",
        butter: "#FFF1B8",
        sky: "#D6ECFF",
        ink: "#3B3355",
        brick: {
          red: "#E3000B",
          yellow: "#FFD500",
          blue: "#0055BF",
          green: "#00A650",
          orange: "#FF7F1E",
        },
      },
      fontFamily: {
        kid: ["Chillax", "Nunito", "ui-rounded", "system-ui", "sans-serif"],
      },
      borderRadius: { squish: "2rem" },
      boxShadow: {
        squish: "0 10px 0 -2px rgba(59,51,85,0.08), 0 18px 40px -12px rgba(59,51,85,0.18), inset 0 2px 0 rgba(255,255,255,0.9)",
        brick: "inset 0 -6px 0 rgba(0,0,0,0.18), inset 0 3px 0 rgba(255,255,255,0.35), 0 6px 14px -6px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
};
