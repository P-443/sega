import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
      },
      colors: {
        board: {
          light: '#d9b382',
          dark: '#8a5a2b',
        },
      },
      animation: {
        'stone-pop': 'stone-pop 150ms ease-out',
        'stone-settle': 'stone-settle 260ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        'fade-in': 'fade-in 180ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'win-line': 'win-line 1.3s ease-out forwards',
        'khawaja-warn': 'khawaja-warn 1s ease-in-out infinite',
      },
      keyframes: {
        'stone-pop': {
          '0%': { transform: 'scale(0.6)', opacity: '0.4' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        // brick lands on its square: overshoots big, dips small, settles
        'stone-settle': {
          '0%': { transform: 'scale(1.35)' },
          '55%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        // winning line draws itself across the board (pathLength normalizes to 1)
        'win-line': {
          '0%': { strokeDashoffset: '1' },
          '100%': { strokeDashoffset: '0' },
        },
        // pulsing amber ring around a khawaja brick that blocked a line
        'khawaja-warn': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(251,191,36,0.65)' },
          '50%': { boxShadow: '0 0 0 7px rgba(251,191,36,0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
