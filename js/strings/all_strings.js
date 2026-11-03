// /js/strings/all_strings.js
// Lista de todo lo que aparece en Ajustes > Textos.
// Al agregar una pantalla: importá su archivo de textos acá y, si tiene data-tx en el HTML,
// agregá el HTML a HTML_SOURCES (namespace html_<archivo>).
import "/js/strings.js";
import "/js/cartaglow_strings.js";
import "/js/strings/membership_strings.js";
import "/js/strings/playbook_strings.js";
import "/js/features/pickups/pickups_settings.js";
import "/js/features/admin/maintenance_reset.js";
import "/js/strings/screens/admin.js";
import "/js/strings/screens/admin_edit_user.js";
import "/js/strings/screens/assoc_accounting.js";
import "/js/strings/screens/assoc_member_modal.js";
import "/js/strings/screens/assoc_members_list.js";
import "/js/strings/screens/assoc_memberships_list.js";
import "/js/strings/screens/assoc_payments.js";
import "/js/strings/screens/attendance.js";
import "/js/strings/screens/cartaglow_page.js";
import "/js/strings/screens/community.js";
import "/js/strings/screens/dashboard.js";
import "/js/strings/screens/gestion.js";
import "/js/strings/screens/perfil.js";
import "/js/strings/screens/gym.js";
import "/js/strings/screens/gym_editors.js";
import "/js/strings/screens/gym_plan.js";
import "/js/strings/screens/gym_public_routine.js";
import "/js/strings/screens/gym_routine.js";
import "/js/strings/screens/header.js";
import "/js/strings/screens/home.js";
import "/js/strings/screens/landing.js";
import "/js/strings/screens/club_events.js";
import "/js/strings/screens/loader.js";
import "/js/strings/screens/media_viewer.js";
import "/js/strings/screens/member_status.js";
import "/js/strings/screens/membership_assign.js";
import "/js/strings/screens/membership_detail.js";
import "/js/strings/screens/membership_pay.js";
import "/js/strings/screens/payment_modal.js";
import "/js/strings/screens/pickups_status.js";
import "/js/strings/screens/playbook_js.js";
import "/js/strings/screens/register_auth.js";
import "/js/strings/screens/register_config.js";
import "/js/strings/screens/register_plans.js";
import "/js/strings/screens/register_services.js";
import "/js/strings/screens/register_submit.js";
import "/js/strings/screens/register_ui.js";
import "/js/strings/screens/role_routing.js";
import "/js/strings/screens/roster.js";
import "/js/strings/screens/signout.js";
import "/js/strings/screens/subscription_plans.js";
import "/js/strings/screens/tournament_editor.js";
import "/js/strings/screens/tournament_roster.js";
import "/js/strings/screens/tournaments_list.js";
import "/js/strings/screens/training_plan_editor.js";
import "/js/strings/screens/training_plan_view.js";
import "/js/strings/screens/trainings_history.js";
import "/js/strings/screens/trainings_ui.js";

// Nombre visible de cada sección (card) del editor. Si no está acá, se usa el del archivo de textos.
export const NAMESPACE_LABELS = {
  html_admin: "Textos fijos de la pantalla",
  html_attendance: "Textos fijos de la pantalla",
  html_community: "Textos fijos de la pantalla",
  html_dashboard: "Textos fijos de la pantalla",
  html_gestion: "Textos fijos de la pantalla",
  html_perfil: "Textos fijos de la pantalla",
  html_gym_plan: "Gimnasio: plan (pantalla)",
  html_gym_routine: "Gimnasio: rutina (pantalla)",
  html_gym_week: "Gimnasio: semana (pantalla)",
  html_index: "Textos fijos de la página de inicio",
  html_member_status: "Estado de membresía (pantalla)",
  html_pickups_status: "Estado de pickups (pantalla)",
  html_playbook: "Textos fijos de la pantalla",
  html_roster: "Textos fijos de la pantalla",
  html_terms: "Términos y condiciones",
  html_trainings_history: "Textos fijos de la pantalla",
  html_training_plan: "Plan de entrenamiento (pantalla pública)",
  html_register: "Formulario de registro",
  html_cartaglow: "Cartaglow (pantalla)",
  html_tournament_info: "Info de torneo (pantalla)",
  html_assoc_member_modal: "Ventana: editar asociado",
  html_community_post_modal: "Ventana: nueva publicación",
  html_drill_create_modal: "Ventana: crear drill",
  html_drill_editor_modal: "Ventana: editar drill",
  html_gym_exercise_modal: "Ventana: ejercicio de gimnasio",
  html_gym_program_editor: "Ventana: plan de gimnasio",
  html_gym_routine_editor: "Ventana: rutina de gimnasio",
  html_membership_assignment_manual: "Ventana: asignar membresía",
  html_payment_modal: "Ventana: pago",
  html_player_modal: "Ventana: jugador",
  html_tournament_editor: "Ventana: torneo",
  html_training_plan_editor: "Ventana: plan de entrenamiento",
  html_training_session_modal: "Ventana: sesión de entrenamiento",
  html_tournament_roster: "Roster del torneo (pantalla)",
};

// Pantallas del editor de textos, en el mismo orden que el menú de la app.
// Cada pantalla junta los textos de su HTML, sus mensajes (JS) y sus ventanas.
// Lo que no esté en ninguna pantalla aparece en "Otros".
export const TEXT_SCREENS = [
  { id: "general", group: "General", label: "Menú, club y avisos", ns: ["club", "header", "loader", "signout", "role_routing", "media_viewer"] },
  { id: "inicio", group: "Inicio", label: "Inicio", ns: ["html_dashboard", "dashboard", "club_events"] },
  { id: "sesiones", group: "Entrenar", label: "Sesiones", ns: ["html_trainings_history", "trainings_history", "trainings_ui", "html_training_session_modal"] },
  { id: "asistencia", group: "Entrenar", label: "Asistencia", ns: ["html_attendance", "attendance"] },
  {
    id: "playbook", group: "Entrenar", label: "Playbook y gimnasio",
    ns: [
      "html_playbook", "playbook", "playbook_js", "html_drill_create_modal", "html_drill_editor_modal",
      "training_plan_editor", "html_training_plan_editor", "html_training_plan", "training_plan_view",
      "gym", "gym_editors", "gym_plan", "gym_routine", "gym_public_routine", "html_gym_plan", "html_gym_routine",
      "html_gym_week", "html_gym_exercise_modal", "html_gym_program_editor", "html_gym_routine_editor",
    ],
  },
  { id: "roster", group: "Equipo", label: "Roster", ns: ["html_roster", "roster", "html_player_modal"] },
  { id: "torneos", group: "Equipo", label: "Torneos", ns: ["tournaments", "tournaments_list", "tournament_editor", "html_tournament_editor", "tournament_roster", "html_tournament_roster"] },
  { id: "feed", group: "Comunidad", label: "Feed", ns: ["html_community", "community", "html_community_post_modal"] },
  { id: "perfil", group: "Comunidad", label: "Mi perfil", ns: ["html_perfil", "perfil"] },
  {
    id: "miembros", group: "Gestión", label: "Miembros",
    ns: [
      "html_gestion", "gestion", "assoc_members_list", "assoc_memberships_list", "assoc_member_modal",
      "html_assoc_member_modal", "memberships", "membership_assign", "html_membership_assignment_manual", "membership_detail",
    ],
  },
  { id: "finanzas", group: "Gestión", label: "Finanzas", ns: ["assoc_payments", "assoc_accounting", "payment_modal", "html_payment_modal", "membership_pay"] },
  { id: "pickups", group: "Gestión", label: "Pickups", ns: ["pickups", "pickups_status", "html_pickups_status"] },
  { id: "ajustes", group: "Gestión", label: "Ajustes", ns: ["html_admin", "admin", "admin_edit_user", "landingAdmin", "subscription_plans", "textsEditor", "maintenance"] },
  { id: "landing", group: "Sitio público", label: "Página de inicio", ns: ["html_index", "home", "landing", "html_terms"] },
  {
    id: "registro", group: "Sitio público", label: "Registro y membresía",
    ns: [
      "html_register", "register_auth", "register_config", "register_plans", "register_services",
      "register_submit", "register_ui", "html_member_status", "member_status",
    ],
  },
  { id: "eventos", group: "Sitio público", label: "Torneos públicos", ns: ["cartaglow", "cartaglow_page", "html_cartaglow", "html_tournament_info"] },
];

// HTML con data-tx: el editor lee los textos por defecto de acá.
export const HTML_SOURCES = [
  "/admin.html",
  "/attendance.html",
  "/community.html",
  "/dashboard.html",
  "/gestion.html",
  "/perfil.html",
  "/gym_plan.html",
  "/gym_routine.html",
  "/gym_week.html",
  "/index.html",
  "/member_status.html",
  "/pickups_status.html",
  "/playbook.html",
  "/roster.html",
  "/terms.html",
  "/trainings_history.html",
  "/training_plan.html",
  "/public/register.html",
  "/public/cartaglow.html",
  "/public/tournament_info.html",
  "/partials/assoc_member_modal.html",
  "/partials/community_post_modal.html",
  "/partials/drill_create_modal.html",
  "/partials/drill_editor_modal.html",
  "/partials/gym_exercise_modal.html",
  "/partials/gym_program_editor.html",
  "/partials/gym_routine_editor.html",
  "/partials/membership_assignment_manual.html",
  "/partials/payment_modal.html",
  "/partials/player_modal.html",
  "/partials/tournament_editor.html",
  "/partials/training_plan_editor.html",
  "/partials/training_session_modal.html",
  "/pages/admin/tournament_roster.html",
];
