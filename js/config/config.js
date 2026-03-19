//js\config\config.js

export const APP_CONFIG = {
  version: "0.4",

  club: {
    id: "volcanes",
    name: "Volcanes Ultimate",
  },

  collections: {
    associates: "associates",
    players: "club_players",
    club_players: "club_players",
    guests: "guest_players",

    users: "users",

    attendance: "club_attendance",

    tournaments: "tournaments",
    trainings: "trainings",

    drills: "drills",
    playbookTrainings: "playbook_trainings",

    gymRoutines: "gym_routines",
    gymPlans: "gym_programs",
    gymExercises: "gym_exercises",

    subscriptionPlans: "subscription_plans",
    memberships: "memberships",
    membershipInstallments: "membership_installments",
    membershipPaymentSubmissions: "membership_payment_submissions",

    finance_movements: "finance_movements",
    finance_movements_history: "finance_movements_history",

    communityPosts: "community_posts",

    club_config: "club_config",
    club_honors: "honors",
    club_uniforms: "uniforms",

    pickups: "pickups",
    pickupRegistrations: "pickup_registrations",
  },

  pickups: {
    defaultCapacity: 50, // 0 = sin límite
    allowWaitlistByDefault: true,
    defaultCancellationHours: 6,
  },
  
  sport: "ultimate",

  userRoles: [
    { id: "viewer", label: "Viewer" },
    { id: "staff", label: "Staff" },
    { id: "coach", label: "Coach" },
    { id: "admin", label: "Admin" },
    { id: "accountability", label: "Accountability" },
    { id: "content_editor", label: "Content Editor" },
  ],

  playerRoles: [
    { id: "", label: "Sin definir" },
    { id: "handler", label: "Handler" },
    { id: "cutter", label: "Cutter" },
    { id: "hybrid", label: "Hybrid" }
  ],

  roster: {
    filters: {
      genders: [
        { value: "F", label: "Femenino" },
        { value: "M", label: "Masculino" }
      ]
    }
  },

  admin: {
    pages: {
      users: true,
    }
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
      name: "ClubFont",
      url: "/fonts/club-font.woff2",
      ttf: "/fonts/club-font.ttf"
    },

    logo: "/img/logos/club_logo.png"
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
  },
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
