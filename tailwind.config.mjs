/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: '#0a0d12',
        card: '#121721',
        'card-sub': '#18202e',
        'amber-glow': '#f59e0b',
        'crimson-glow': '#ef4444',
        'border-slate': '#222f42',
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '1rem',
        xl: '1.5rem',
        full: '9999px',
      },
      fontFamily: {
        headline: ['Literata', 'serif'],
        display: ['Literata', 'serif'],
        body: ['Nunito Sans', 'sans-serif'],
        label: ['Nunito Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
