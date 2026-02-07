/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'editor-bg': '#1a1a1a',
        'editor-surface': '#2a2a2a',
        'editor-border': '#3a3a3a',
        'editor-accent': '#3b82f6',
        'editor-accent-hover': '#2563eb',
      }
    },
  },
  plugins: [],
}
