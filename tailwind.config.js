/** @type {import('tailwindcss').Config} */

// Portal accent colour. Values live in src/index.css (ACCENT SSOT) as "R G B"
// triplets; this only names them, so `bg-accent-solid` or `bg-accent-500/20`
// follows whatever accent the customer picked. <alpha-value> is how Tailwind
// v3 (the copy react-scripts actually compiles with) applies an opacity
// modifier to a variable colour.
const accentVar = (name) => `rgb(var(--accent-${name}) / <alpha-value>)`;
const accent = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((shade) => [shade, accentVar(shade)])
);
accent.solid = accentVar('solid');
accent['solid-hover'] = accentVar('solid-hover');
accent['on-solid'] = accentVar('on-solid');
accent.text = accentVar('text');

module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent,
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

