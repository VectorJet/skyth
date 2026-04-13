// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        'bg-color': 'var(--bg-color)',
        'surface': 'var(--surface-color)',
        'primary-text': 'var(--primary-text-color)',
        'secondary-text': 'var(--secondary-text-color)',
        'accent': 'var(--accent-color)',
        'active': 'var(--active-color)',
        'input-bg': 'var(--input-bg)',
        'button-bg': 'var(--button-bg)',
        'border-color': 'var(--border-color)',
      },
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body': 'var(--primary-text-color)',
            '--tw-prose-headings': 'var(--primary-text-color)',
            '--tw-prose-links': 'var(--accent-color)',
            '--tw-prose-bold': 'var(--primary-text-color)',
            '--tw-prose-counters': 'var(--secondary-text-color)',
            '--tw-prose-bullets': 'var(--border-color)',
            '--tw-prose-hr': 'var(--border-color)',
            '--tw-prose-quotes': 'var(--primary-text-color)',
            '--tw-prose-quote-borders': 'var(--border-color)',
            '--tw-prose-captions': 'var(--secondary-text-color)',
            // --- FIX: Use accent color for prose code ---
            '--tw-prose-code': 'var(--accent-color)',
            '--tw-prose-pre-code': 'var(--primary-text-color)',
            '--tw-prose-pre-bg': 'var(--surface-color)',
            '--tw-prose-th-borders': 'var(--border-color)',
            '--tw-prose-td-borders': 'var(--border-color)',
            // --- FIX: Use accent color for inline code blocks ---
            code: { 
              backgroundColor: 'var(--button-bg)', 
              color: 'var(--accent-color)', 
              padding: '0.2em 0.4em', 
              margin: '0', 
              fontSize: '85%', 
              borderRadius: '6px',
              fontWeight: '600',
            },
            'code::before': { content: '""' },
            'code::after': { content: '""' },
          },
        },
      },
      keyframes: {
        shimmer: {
          "0%, 90%, 100%": { "background-position": "calc(-100% - var(--shimmer-width)) 0" },
          "30%, 60%": { "background-position": "calc(100% + var(--shimmer-width)) 0" },
        },
        spin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        "context-menu-in": {
          from: { opacity: '0', transform: 'scale(0.95) translateY(5px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        shimmer: "shimmer 4s infinite",
        spin: 'spin 1s linear infinite',
        "context-menu-in": 'context-menu-in 0.15s ease-out',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};
export default config;