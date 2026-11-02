// /js/strings/screens/landing.js
// Textos por defecto de las secciones nuevas del landing y de su editor en Admin.
// Lo que se escribe en Admin > Landing (Firebase) tiene prioridad sobre estos.
import { defineStrings, fmt } from "/js/core/texts.js";

export const LX = defineStrings("landing", "Inicio: secciones nuevas", {
  // portada
  heroCtaPrimary: "Sumate al club",
  heroCtaSecondary: "Próximos eventos",

  // calendario
  calendarTitle: "Próximos eventos",
  calendarSubtitle: "Entrenos, pickups abiertos y torneos del club. Tocá un día para ver qué hay.",
  calendarEmpty: "No hay eventos próximos por ahora.",
  calendarCtaText: "¿Querés jugar? Los pickups están abiertos a todos.",
  calendarCtaButton: "Ver pickups abiertos",
  kindPickup: "Pickup",
  kindTournament: "Torneo",

  // cómo unirte
  joinTitle: "Cómo unirte",
  joinSubtitle: "Sumarte es fácil, no necesitás experiencia.",
  joinStep1Title: "Vení a un pickup",
  joinStep1Text: "Probá un juego abierto: es la mejor forma de conocernos.",
  joinStep2Title: "Creá tu cuenta",
  joinStep2Text: "Registrate en la plataforma con tu correo o Google.",
  joinStep3Title: "Entrená con nosotros",
  joinStep3Text: "Te avisamos los horarios y te sumamos al grupo.",
  joinRegister: "Crear cuenta",
  joinPickups: "Ver pickups",

  // números
  statsTitle: "El club en números",

  // patrocinadores
  sponsorsTitle: "Patrocinadores",
  sponsorsSubtitle: "Gracias a quienes nos apoyan.",

  // galería
  galleryTitle: "Galería",
  gallerySubtitle: "Momentos del club. ¿Tenés fotos? Subilas y las publicamos.",
  galleryUpload: "Subir fotos",
  galleryLoginToUpload: "Ingresá para subir fotos",
  galleryEmpty: "Todavía no hay fotos.",
  galleryUploadTitle: "Subir fotos a la galería",
  galleryUploadHint: "Un admin las revisa antes de publicarlas. Máximo {mb} MB por foto.",
  galleryCaption: "Descripción (opcional)",
  galleryUploading: "Subiendo {n} de {total}…",
  galleryUploaded: "¡Gracias! Tus fotos quedan pendientes de aprobación.",
  galleryUploadError: "No se pudo subir: {error}",
  galleryErrorTooBig: "la foto pesa más de {mb} MB",
  galleryErrorNotImage: "solo se aceptan imágenes",
  galleryMine: "Tus fotos pendientes: {n}",
  galleryBy: "Foto: {name}",
  cancel: "Cancelar",
  send: "Subir",

  // skeleton / general
  loading: "Cargando…",
});

export const lxf = fmt;

// Textos del editor (Admin > Landing)
export const LA = defineStrings("landingAdmin", "Admin: secciones del landing", {
  orderTitle: "Secciones del landing",
  heroCard: "Portada",
  heroTitles: "Títulos que rotan",
  heroTitlesHint: "Un título por bloque; dejá una línea en blanco entre títulos. Un salto de línea dentro del título lo parte en dos renglones. Vacío = títulos por defecto del club.",
  heroInterval: "Segundos entre títulos",
  heroCtaHint: "Dejá el texto en \"-\" para ocultar un botón. Links: /public/register.html, #calendarSection, https://…",
  ctaPrimary: "Botón principal",
  ctaSecondary: "Botón secundario",
  ctaLabel: "Texto",
  ctaUrl: "Link",
  orderHint: "Prendé o apagá secciones y ordenalas con las flechas.",
  up: "Subir",
  down: "Bajar",
  saveOrder: "Guardar orden",
  saved: "Guardado.",
  error: "No se pudo guardar.",
  sectionHero: "Portada",
  sectionCalendar: "Próximos eventos",
  sectionTrainings: "Entrenamientos y juegos",
  sectionJoin: "Cómo unirte",
  sectionFeatured: "Actividad destacada",
  sectionStats: "Números del club",
  sectionEvents: "Torneos / eventos",
  sectionHonors: "Palmarés",
  sectionGallery: "Galería",
  sectionUniforms: "Uniformes",
  sectionSponsors: "Patrocinadores",
  alwaysOn: "Siempre visible",

  title: "Título",
  subtitle: "Subtítulo",
  defaultHint: "Vacío = texto por defecto",
  save: "Guardar",
  add: "+ Agregar",
  remove: "Quitar",

  calendarCard: "Próximos eventos (calendario)",
  calendarHint: "Muestra entrenamientos, pickups publicados y torneos.",
  calendarCtaTextLabel: "Texto del botón de pickups (al lado)",
  calendarCtaButtonLabel: "Botón a la página de pickups (\"-\" lo oculta)",

  joinCard: "Cómo unirte",
  joinSteps: "Pasos",
  stepTitle: "Título del paso",
  stepText: "Texto",
  registerLabel: "Botón de registro",
  pickupsLabel: "Botón de pickups",

  statsCard: "Números del club",
  statsHint: "Ej: 80 · Jugadores, 2023 · Fundados, 12 · Torneos.",
  statValue: "Número",
  statLabel: "Etiqueta",

  sponsorsCard: "Patrocinadores",
  sponsorName: "Nombre",
  sponsorUrl: "Link (opcional)",
  sponsorLogo: "Logo",
  uploading: "Subiendo…",

  galleryCard: "Galería de fotos",
  allowUploads: "Permitir que los usuarios con cuenta suban fotos (con aprobación)",
  pendingTitle: "Pendientes de aprobación ({n})",
  approvedTitle: "Publicadas ({n})",
  noPending: "No hay fotos pendientes.",
  approve: "Aprobar",
  reject: "Rechazar",
  delete: "Borrar",
  deleteConfirm: "¿Borrar esta foto para siempre?",
  adminUpload: "Subir fotos (se publican directo)",

  themeCard: "Tema del club",
  themeHint: "Colores, logo y favicon para toda la app.",
  primary: "Color principal",
  accent: "Color de acento",
  logo: "Logo (header)",
  logoShowText: "Mostrar el nombre al lado del logo",
  favicon: "Ícono de pestaña (favicon)",
  removeImage: "Quitar imagen",

  seoCard: "Buscadores y compartir",
  seoHint: "Título y descripción para Google y la pestaña del navegador.",
  seoTitle: "Título de la página",
  seoDescription: "Descripción",
  seoImage: "Imagen para compartir",
  seoTagsTitle: "Vista previa en WhatsApp / Facebook",
  seoTagsHint: "WhatsApp y Facebook no leen datos de Firebase: para que la vista previa del link cambie, pegá estas líneas dentro del <head> de index.html.",
  copy: "Copiar",
  copied: "Copiado",
});
