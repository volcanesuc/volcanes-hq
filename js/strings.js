// js/strings.js
export const CLUB_DATA = {
  club: {
    id: "volcanes",
    shortName: "Volcanes",
    name: "Volcanes Ultimate",
    foundedYear: 2023
  },

  header: {
    logoText: "Volcanes",
    mobileTitle: "Volcanes Ultimate",
    cta: {
      login: {
        label: "Ingresar",
        href: "login.html"
      },
      register: {
        label: "Crear cuenta",
        href: "public/register.html"
      }
    },
    menu: [
      { id: "home", label: "Home", href: "/dashboard.html" },
      { id: "roster", label: "Roster", href: "/roster.html" },
      { id: "trainings", label: "Entrenamientos", href: "/trainings.html" },
      { id: "attendance", label: "Asistencia", href: "/attendance.html" },
      { id: "tournaments", label: "Torneos", href: "/tournaments.html" },
      { id: "playbook", label: "Playbook", href: "/playbook.html" },
      { id: "association", label: "Asociación", href: "/association.html" }
    ],
    logout: {
      label: "SALIR"
    }
  },

  landing: {
    hero: {
      title: "Más que un equipo, una comunidad",
      image: "img/volcanes/campeones2025.jpg",
      description:
        "La misión del club es fortalecer la comunidad y promover el conocimiento y la práctica del deporte bajo el correcto espíritu de juego. Queremos crear espacios donde se practique de manera saludable el Ultimate.",
      cta: {
        primary: {
            label: "Ver entrenamientos",
            href: "#entrenamientos"
        },
        secondary: {
            label: "Contactar por WhatsApp",
            type: "whatsapp"
        }
      }
    },

    contacts: {
        whatsapp: {
            label: "Escribinos por WhatsApp",
            phone: "+50670567463",
            message: "Hola, quiero info sobre los entrenamientos de Volcanes"
        }
    },

    events: [
      {
        id: "cartaglow",
        name: "Cartaglow",
        edition: 2025,
        type: "hat-mixto",
        format: "un-dia",
        participants: 82,
        nextEdition: {
          month: "Agosto",
          year: 2026
        },
        description:
          "Torneo tipo hat mixto, de un solo día, enfocado en comunidad y espíritu de juego.",
        images: [
          "img/cartaglow/cartaglow00.jpg",
          "img/cartaglow/cartaglow01.jpg",
          "img/cartaglow/cartaglow02.jpg"
        ]
      }
    ],

    trainings: {
      title: "Entrenamientos y Juegos",
      blocks: [
        {
          id: "trainings",
          name: "Entrenamientos",
          schedule: [
            { day: "Domingos", time: "8:00 am – 10:30 am" },
            { day: "Miércoles", time: "7:00 pm – 9:30 pm" }
          ]
        },
        {
          id: "games",
          name: "Juegos y Torneos",
          schedule: [{ day: "Martes", time: "8:00 pm – 10:00 pm" }]
        }
      ]
    },

    honors: {
      title: "Palmarés",
      items: [
        {
          position: "Primer Lugar",
          tournament: "Copa Invierno",
          year: 2025
        },
        {
          position: "Tercer Lugar",
          tournament: "Copa Verano",
          year: 2025
        },
        {
          position: "Primer Lugar",
          tournament: "Espíritu Chorotega Primera Edición",
          year: 2025
        },
        {
          position: "Espíritu de Juego",
          tournament: "Copa Invierno",
          year: 2024
        }
      ]
    },

    uniforms: {
      title: "Uniformes del Equipo",
      subtitle: "Compra tu indumentaria oficial del club",
      CTA: "Comprar",
      orderUrl:
        "https://docs.google.com/forms/d/e/1FAIpQLScWsh7S91GY6MZ_1ewNu1Eth7L0IK9ycHwbySY5THZe3vM2mg/viewform",
      items: [
        {
          id: "jersey-home",
          name: "Camisa Oficial",
          category: "camisa",
          image: "img/camisas/classic.PNG"
        },
        {
          id: "jersey-away",
          name: "Camisa Alternativa",
          category: "camisa",
          image: "img/camisas/alternate.png"
        },
        {
          id: "vest",
          name: "Chaleco",
          category: "chaleco",
          image: "img/camisas/vest.PNG"
        },
        {
          id: "hoodie",
          name: "Hoodie",
          category: "abrigo",
          image: "img/camisas/hoodie.PNG"
        },
        {
          id: "shorts",
          name: "Pantaloneta",
          category: "pantaloneta",
          image: "img/camisas/shorts.PNG"
        }/*,
        {
          id: "cap",
          name: "Gorra",
          category: "accesorio",
          image: "img/camisas/cap.jpg"
        }*/
      ]
    }
  },

  footer: {
    copyright: "© Volcanes Ultimate"
  }
};


export const TOURNAMENT_STRINGS = {
  page: {
    title: "Torneos",
    subtitle: "Planificación de torneos y participación del equipo",
    empty: "No hay torneos registrados todavía."
  },

  actions: {
    add: "Nuevo torneo",
    edit: "Editar torneo",
    delete: "Eliminar torneo",
    save: "Guardar",
    cancel: "Cancelar",
    confirmDelete: "¿Eliminar este torneo? Esta acción no se puede deshacer."
  },

  fields: {
    name: {
      label: "Nombre del torneo",
      placeholder: "Ej: Torneo Cartaglow"
    },
    dateStart: {
      label: "Fecha inicio"
    },
    dateEnd: {
      label: "Fecha fin"
    },
    type: {
      label: "Tipo",
      options: {
        mixto: "Mixto",
        open: "Open",
        fem: "Femenino"
      }
    },
    age: {
      label: "Categoría",
      options: {
        open: "Open",
        master: "Master",
        u24: "U24",
        u17: "U17",
        u15: "U15"
      }
    },
    venue: {
      label: "Modalidad",
      options: {
        outdoor: "Outdoor",
        indoor: "Indoor"
      }
    },
    location: {
      label: "Lugar",
      placeholder: "Ciudad, cancha, país…"
    },
    teamFee: {
      label: "Team fee",
      helper: "Costo total del equipo"
    },
    playerFee: {
      label: "Player fee",
      helper: "Costo por jugador"
    },
    notes: {
      label: "Notas",
      placeholder: "Fechas, logística, uniformes, horarios…"
    },
    confirmed: {
      label: "Torneo confirmado"
    }
  },

  list: {
    headers: {
      name: "Nombre",
      date: "Fecha",
      type: "Tipo",
      age: "Edad",
      venue: "Indoor / Outdoor",
      fees: "Fees",
      actions: "Acciones"
    }
  },

  fees: {
    team: "Team",
    player: "Player",
    currency: "₡"
  },

  search: {
    placeholder: "Buscar torneo…"
  },

  roster: {
    title: "Roster del torneo",
    subtitle: "Jugadores convocados",
    empty: "No hay jugadores asignados a este torneo."
  },

  games: {
    title: "Partidos",
    add: "Agregar partido",
    empty: "No hay partidos registrados.",
    fields: {
      opponent: "Rival",
      score: "Marcador",
      date: "Fecha",
      notes: "Notas del partido"
    }
  },

  stats: {
    title: "Estadísticas individuales",
    goals: "Goles",
    assists: "Asistencias",
    defs: "Defensas",
    total: "Total"
  },

  messages: {
    saved: "Torneo guardado correctamente.",
    deleted: "Torneo eliminado.",
    errorSave: "Error al guardar el torneo.",
    errorDelete: "Error al eliminar el torneo.",
    missingRequired: "Faltan campos obligatorios."
  }
};
