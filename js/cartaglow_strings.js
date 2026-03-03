export const CARTAGLOW_DATA = {
  meta: {
    title: "Cartaglow",
    ogImage: "img/cartaglow/logo-cartaglow-dark.png"
  },

  header: {
    clubName: "Volcanes Ultimate",
    instagramUrl: "https://instagram.com/cartaglow.hat"
  },

  hero: {
    editionPill: "Cartaglow • Edición 2026",
    title: "Cartaglow 2026",
    subtitle: "Torneo Hat MIXTO 7v7 — vení a jugar revuelto, relajado y con sombrero 🧢",
    image: "img/cartaglow/logo-cartaglow-dark.jpeg"
  },

  registration: {
    ctaLabel: "Registro Cartaglow 2026 (Próximamente)",
    enabled: false,                 // 🔒 queda listo pero deshabilitado
    url: "https://forms.gle/XXXXX",  // cuando habiliten, ponés el real
    disabledNote: "Registro 2026 aún no está abierto. En cuanto esté listo, activamos este botón."
  },

  calendar: {
    // podés generar un link tipo Google Calendar:
    addToCalendarUrl:
      "https://calendar.google.com/calendar/render?action=TEMPLATE&dates=20260808T190000Z%2F20260809T010000Z&details=&location=Cartago&text=Cartaglow%202026"
  },

  infoCards: [
    {
      icon: "bi-calendar-event",
      title: "Fecha y hora",
      lines: ["Agosto 2026 (por confirmar)", "1:00PM – 7:00PM"],
      link: "" // si querés que se pueda clickear, poné url
    },
    {
      icon: "bi-geo-alt",
      title: "Ubicación",
      lines: ["Cartago, Costa Rica", "Sede por confirmar"],
      link: "https://www.waze.com/"
    },
    {
      icon: "bi-people",
      title: "Formato",
      lines: ["MIXTO 7v7", "Tipo HAT", "Sombrero obligatorio 🧢"],
      link: ""
    },
    {
      icon: "bi-wallet2",
      title: "Precio",
      lines: ["Early Bird: —", "Regular: —"],
      link: ""
    }
  ],

  testimonials: {
    title: "Mensajes de ediciones anteriores",
    subtitle: "Un par de frases que resumen el espíritu del hat",
    items: [
      {
        text: [
          "Lo que ocupamos es un Hat para jugar un ratico todos revueltos y bajarle al drama.",
          "Cartaglow estuvo chivisima jugando todos revueltos."
        ],
        author: "Edu Amador",
        source: "Chat de Frisberos"
      },
      {
        text: [
          "A volcanes y los organizadores del torneo, muchísimas gracias. Estuvo súper chiva.",
          "Reconocerles la marcación de cancha y el registro con anticipación."
        ],
        author: "Verónica Murcia",
        source: "Capitana Fresitas UC"
      }
    ]
  },

  showcase: {
    title: "Showcase",
    text: "Nuestras fotos favoritas del 2024. Álbum completo en el enlace.",
    credit: "* Fotografías por Esteban Mejías",
    albumUrl: "https://estebanmejias.pixieset.com/cartaglowhat2024",
    thumbs: [
      "img/cartaglow/cartaglow00.jpg",
      "img/cartaglow/cartaglow04.jpg",
      "img/cartaglow/cartaglow01.jpg",
      "img/cartaglow/cartaglow02.JPG",
      "img/cartaglow/cartaglow03.jpg",
      "img/cartaglow/cartaglow06.jpg"
    ]
  },

   media2025: {
    title: "Cartaglow 2025",
    subtitle: "Final + galería oficial",
    finalVideo: {
      label: "Ver final 2025",
      url: "https://youtu.be/For0QM0ehww"
    },
    gallery: {
      label: "Galería 2025",
      url: "https://photos.google.com/share/AF1QipNyVx7o_oeeCpNtzfb0sy-AgwbJ6PpqRc1k_EGgxY64pKaic_9yEPAsyd6ssoncYA?pli=1&key=UXNyR2U1U1pzZWlRNjZ6TXNIcHRJUE9YMElwdDdR"
    }
  },

  stats2024: {
    title: "Stats Cartaglow 2024",
    subtitle: "Cargadas desde un CSV público",
    csvUrl:
      "https://raw.githubusercontent.com/volcanesuc/volcanesuc.github.io/main/csv/stats_2024.csv",
    sourceUrl:
      "https://github.com/volcanesuc/volcanesuc.github.io/blob/main/csv/stats_2024.csv",
    footnote:
      "Si cambiás el CSV, la tabla se actualiza sola. Si la estructura varía, igual lo mostramos (modo genérico).",

    // Opcional: si querés limitar columnas visibles:
    // visibleColumns: ["Player", "Team", "Goals", "Assists"],
    visibleColumns: null,

    // Opcional: KPIs automáticos
    // si no sabés nombres exactos, dejalo null y el script intenta adivinar
    kpis: [
      { label: "Filas", type: "rows" },
      { label: "Jugadores únicos", type: "unique", columnGuess: ["player", "name", "jugador"] },
      { label: "Equipos únicos", type: "unique", columnGuess: ["team", "equipo"] }
    ]
  },

  footer: {
    text: "Cartaglow • Volcanes Ultimate"
  }
};
