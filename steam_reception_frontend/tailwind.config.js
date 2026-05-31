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
        // Atmos palette — flat tokens for the reception SPA (admin/operational vibe,
        // less ornamental than the guest UI).
        sand:  "#f4ede1",
        bone:  "#fdfbf6",
        ink:   "#0e0e0e",
        line:  "#e7dfd0",
        muted: "#7a7062",
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
