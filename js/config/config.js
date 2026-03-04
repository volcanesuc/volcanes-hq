//js\config\config.js
// 
export const APP_CONFIG = {
  version: "0.3",

  club: {
    id: "volcanes",
    name: "Volcanes Ultimate",
    playersCollection: "club_players",
    tournamentsCollection: "tournaments",
    trainingsCollection: "trainings"
  },

  //deben ser reemplazados tambien en: main.css -> root para que carguen por defecto
  theme: {
    colors: {
      primary: "#19473f",
      primaryDark: "#12352f",
      primaryLight: "#2c6b61",
      accent: "#e8ce26",
      accentSoft: "#f4e47a",
      clubGray: "#f4f4f4",
      bg: "#f5f6f8",
      bgSoft: "#fafafa",
      card: "#ffffff",
      text: "#1f2328",
      textSoft: "#6b7280",
      border: "#e5e7eb"
    },

    font: {
      name: "Recons",
      url: "/fonts/Recons-Regular.woff2",
      ttf: "/fonts/Recons-Regular.ttf"
    },

    logo: "/img/logos/volcano_logo.jpg"
  },
  // Firebase (centralizado)
  firebase: {
    apiKey: "AIzaSyABSy5kImaF9VyNisu2vkihm2y4mfYGodw",
    authDomain: "auth.volcanes.clubstudiohq.com",
    projectId: "rifavolcanes",
    storageBucket: "rifavolcanes.firebasestorage.app",
    messagingSenderId: "991215068881",
    appId: "1:991215068881:web:6fb46dab34bf1a572a47f0",
    measurementId: "G-6ZYXBJW3JY"
  }
};

/* ========================================
   APPLY THEME AUTO (runs on import)
======================================== */
function applyThemeFromConfig() {
  const t = APP_CONFIG?.theme;
  if (!t) return;

  const root = document.documentElement;
  const c = t.colors || {};

  /* 🎨 map config -> CSS variables existentes */
  const map = {
    primary: "--theme-primary",
    primaryDark: "--theme-primary-dark",
    primaryLight: "--theme-primary-light",
    accent: "--theme-accent",
    clubGray: "--theme-gray",

    bg: "--bg",
    bgSoft: "--bg-soft",
    card: "--card",
    text: "--text",
    textSoft: "--text-soft",
    border: "--border"
  };

  for (const [key, cssVar] of Object.entries(map)) {
    if (c[key]) root.style.setProperty(cssVar, c[key]);
  }

  /* FONT (solo títulos) */
  if (t.font?.name) {
    root.style.setProperty(
      "--font-title",
      `"${t.font.name}", system-ui, -apple-system, sans-serif`
    );
  }

  /* 🖼 logo dinámico */
  if (t.logo) {
    document.querySelectorAll(".club-logo").forEach(img => {
      img.src = t.logo;
    });
  }
}

/* auto run solo en browser */
if (typeof window !== "undefined") {
  applyThemeFromConfig();
}
