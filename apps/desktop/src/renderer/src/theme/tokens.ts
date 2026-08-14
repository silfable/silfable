export const themeTokens = {
  colors: {
    bg: "#070707",
    bgGradient: "linear-gradient(145deg, #070707, #15100B)",
    panel: "#11100F",
    panelSecondary: "#1B1713",
    panelElevated: "#241B14",
    border: "rgba(255, 138, 0, 0.18)",
    borderHover: "rgba(255, 138, 0, 0.58)",
    textPrimary: "#FFF7ED",
    textMuted: "#B8AA9C",
    textSubtle: "#776A5E",
    primary: "#FF8A00",
    primaryHover: "#FFAD45",
    primaryLight: "#FFC06A",
    primaryGlow: "rgba(255, 105, 0, 0.2)",
    success: "#FFC06A",
    warning: "#f7b733",
    danger: "#ff5f6d",
    dangerGlow: "rgba(255, 95, 109, 0.3)",
  },
  fonts: {
    sans: 'Manrope, Aptos, ui-sans-serif, system-ui, sans-serif',
    mono: '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace',
    serif: '"Space Grotesk", Aptos, ui-sans-serif, system-ui, sans-serif',
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
    primaryGlow: "0 18px 45px rgba(255, 138, 0, 0.18)",
  },
} as const;

export type ThemeTokens = typeof themeTokens;
