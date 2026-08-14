export const themeTokens = {
  colors: {
    bg: "#0E0B16",
    bgGradient: "linear-gradient(145deg, #0E0B16, #171020)",
    panel: "#171020",
    panelSecondary: "#21162C",
    panelElevated: "#2A1C36",
    border: "rgba(242, 235, 221, 0.14)",
    borderHover: "rgba(167, 139, 250, 0.48)",
    textPrimary: "#F2EBDD",
    textMuted: "#B9AEC2",
    textSubtle: "#776C82",
    primary: "#FF6B5C",
    primaryHover: "#FF8377",
    primaryLight: "#A78BFA",
    primaryGlow: "rgba(255, 107, 92, 0.2)",
    success: "#67E8D4",
    warning: "#f7b733",
    danger: "#ff5f6d",
    dangerGlow: "rgba(255, 95, 109, 0.3)",
  },
  fonts: {
    sans: '"DM Sans", Aptos, ui-sans-serif, system-ui, sans-serif',
    mono: '"Azeret Mono", "SFMono-Regular", Consolas, monospace',
    serif: 'Fraunces, Georgia, serif',
  },
  radii: {
    sm: "6px",
    md: "10px",
    lg: "14px",
    xl: "20px",
    full: "9999px",
  },
  shadows: {
    sm: "0 2px 8px rgba(0, 0, 0, 0.2)",
    md: "0 8px 24px rgba(0, 0, 0, 0.4)",
    lg: "0 24px 60px rgba(0, 0, 0, 0.6)",
    primaryGlow: "0 18px 45px rgba(255, 107, 92, 0.18)",
  },
} as const;

export type ThemeTokens = typeof themeTokens;
