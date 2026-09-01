import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        clay: {
          50: '#faf6f2',
          100: '#f2e9e0',
          200: '#e3d1c0',
          300: '#cfb198',
          400: '#b98d6f',
          500: '#a67254',
          600: '#8c5a41',
          700: '#714637',
          800: '#5c3a30',
          900: '#4c3129',
        },
        moss: {
          50: '#f3f6f3',
          100: '#e2eae1',
          500: '#5f7d5a',
          600: '#4a6546',
          700: '#3c5239',
        },
      },
    },
  },
  plugins: [],
};

export default config;
