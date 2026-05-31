/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Cormorant Garamond"', "Georgia", "serif"],
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
      colors: {
        // Pulled from the Atmos location photo: warm cream sand, deep matte black,
        // smoked-wood brown, soft eucalyptus green.
        sand:  { 50: "#faf7f1", 100: "#f4ede1", 200: "#e8dcc7", 300: "#d9c7a6" },
        ink:   "#0e0e0e",
        smoke: "#1f1d1a",
        wood:  { 400: "#a98668", 500: "#8b6a4c", 600: "#6f5238", 700: "#553e2b" },
        moss:  { 500: "#7d8c5c" },
        bone:  "#fdfbf6",
      },
      letterSpacing: {
        widest: "0.2em",
        atmos:  "0.35em",
      },
      boxShadow: {
        card: "0 1px 3px rgba(20, 16, 10, 0.06), 0 8px 24px -8px rgba(20, 16, 10, 0.10)",
        lift: "0 4px 8px rgba(20, 16, 10, 0.08), 0 16px 40px -12px rgba(20, 16, 10, 0.18)",
      },
    },
  },
  plugins: [],
};
