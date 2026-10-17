/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'jasmeet': {
          'pink': {
            DEFAULT: '#e91e63',
            'light': '#f48fb1',
            'dark': '#c2185b',
          },
          'teal': {
            DEFAULT: '#009688',
            'light': '#4db6ac',
            'dark': '#00796b',
          },
        },
      },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '15%': { transform: 'rotate(-14deg)' },
          '30%': { transform: 'rotate(10deg)' },
          '45%': { transform: 'rotate(-8deg)' },
          '60%': { transform: 'rotate(6deg)' },
          '75%': { transform: 'rotate(-3deg)' },
        },
      },
      animation: {
        wiggle: 'wiggle 0.7s ease-in-out',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

