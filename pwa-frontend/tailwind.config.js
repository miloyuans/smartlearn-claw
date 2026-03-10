/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,jsx}",
    "./src/components/**/*.{js,jsx}",
    "./src/lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eefbf1",
          100: "#d6f5dc",
          500: "#28a745",
          700: "#1b7a32",
          900: "#0f4b1d",
        },
      },
    },
  },
  plugins: [],
};
