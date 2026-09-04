import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        /// Neutral greys carry the whole interface; colour is reserved for the brand mark and
        /// for status, so a screen full of clinical information reads as information.
        clay: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e8e8ea',
          300: '#d6d6da',
          400: '#a5a5ad',
          500: '#78787f',
          600: '#55555c',
          700: '#3d3d43',
          800: '#27272b',
          900: '#18181b',
        },
        /// The single accent: near-black for primary actions and the selected state.
        moss: {
          50: '#f6f6f7',
          100: '#eaeaec',
          500: '#3d3d43',
          600: '#18181b',
          700: '#000000',
        },
      },
    },
  },
  plugins: [],
};

export default config;
