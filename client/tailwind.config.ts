import type { Config } from 'tailwindcss'

// Every color here reads from the raw-HSL custom properties defined in
// src/index.css (e.g. --primary: "348 76% 68%") via hsl(var(--x) / <alpha-value>),
// which is what lets opacity modifiers work (bg-primary/50, text-foreground/70,
// etc.) -- a plain var(--primary) without the hsl() wrapper wouldn't support that.
export default {
  // Dark mode in this app is driven entirely by the CSS variables in
  // index.css (media query + [data-theme] attribute), not Tailwind's own
  // `dark:` variant -- this just keeps the option valid/available should
  // any future component opt into it.
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
    },
    extend: {
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
          glow: 'hsl(var(--primary-glow) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted) / <alpha-value>)',
          foreground: 'hsl(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent-brand) / <alpha-value>)',
          foreground: 'hsl(var(--accent-brand-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        success: 'hsl(var(--success-hsl) / <alpha-value>)',
        border: 'hsl(var(--border-hsl) / <alpha-value>)',
        // Named "field" rather than the shadcn-standard "input" -- Tailwind
        // would otherwise generate a `.text-input` utility (text-{colorKey}),
        // which collides with this app's own long-standing `.text-input`
        // class used on every text field in App.css.
        field: 'hsl(var(--input-hsl) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
        pill: '999px',
      },
      backgroundImage: {
        'gradient-primary': 'var(--gradient-primary)',
        'gradient-subtle': 'var(--gradient-subtle)',
      },
      boxShadow: {
        glow: 'var(--shadow-glow)',
        elegant: 'var(--shadow-elegant)',
      },
      transitionProperty: {
        smooth: 'var(--transition-smooth)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
        bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Consolas', 'monospace'],
        script: ['Caveat', 'cursive'],
      },
    },
  },
  plugins: [],
} satisfies Config
