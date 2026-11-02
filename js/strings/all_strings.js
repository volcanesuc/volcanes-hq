// /js/strings/all_strings.js
// Lista de todo lo que aparece en Ajustes > Textos.
// Al agregar una pantalla: importá su archivo de textos acá y, si tiene data-tx en el HTML,
// agregá el HTML a HTML_SOURCES (namespace html_<archivo>).
import "/js/strings.js";
import "/js/cartaglow_strings.js";
import "/js/strings/membership_strings.js";
import "/js/strings/playbook_strings.js";
import "/js/features/pickups/pickups_settings.js";
import "/js/strings/screens/admin.js";
import "/js/strings/screens/admin_edit_user.js";
import "/js/strings/screens/assoc_accounting.js";
import "/js/strings/screens/assoc_member_modal.js";
import "/js/strings/screens/assoc_members_list.js";
import "/js/strings/screens/assoc_memberships_list.js";
import "/js/strings/screens/assoc_payments.js";
import "/js/strings/screens/association.js";
import "/js/strings/screens/attendance.js";
import "/js/strings/screens/cartaglow_page.js";
import "/js/strings/screens/community.js";
import "/js/strings/screens/dashboard.js";
import "/js/strings/screens/gym.js";
import "/js/strings/screens/gym_editors.js";
import "/js/strings/screens/gym_plan.js";
import "/js/strings/screens/gym_public_routine.js";
import "/js/strings/screens/gym_routine.js";
import "/js/strings/screens/header.js";
import "/js/strings/screens/home.js";
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
import "/js/strings/screens/register_player.js";
import "/js/strings/screens/register_services.js";
import "/js/strings/screens/register_submit.js";
import "/js/strings/screens/register_training.js";
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

// Nombre visible de cada sección del editor (si no, se usa el del archivo de textos).
export const NAMESPACE_LABELS = {
  html_admin: "Admin (página)",
  html_association: "Asociación (página)",
  html_attendance: "Asistencia (página)",
  html_community: "Comunidad (página)",
  html_dashboard: "Dashboard (página)",
  html_gym_plan: "Gimnasio: plan (página)",
  html_gym_routine: "Gimnasio: rutina (página)",
  html_gym_week: "Gimnasio: semana (página)",
  html_index: "Inicio / landing (página)",
  html_member_status: "Estado de membresía (página)",
  html_pickups_status: "Estado de pickups (página)",
  html_playbook: "Playbook (página)",
  html_roster: "Roster (página)",
  html_terms: "Términos y condiciones (página)",
  html_trainings_history: "Historial de entrenamientos (página)",
  html_training_plan: "Plan de entrenamiento (página)",
  html_register: "Registro público (página)",
  html_cartaglow: "Cartaglow (página)",
  html_tournament_info: "Info de torneo (página)",
  html_assoc_member_modal: "Modal: asociado",
  html_community_post_modal: "Modal: publicación",
  html_drill_create_modal: "Modal: crear drill",
  html_drill_editor_modal: "Modal: editar drill",
  html_gym_exercise_modal: "Modal: ejercicio de gimnasio",
  html_gym_program_editor: "Modal: plan de gimnasio",
  html_gym_routine_editor: "Modal: rutina de gimnasio",
  html_membership_assignment_manual: "Modal: asignar membresía",
  html_payment_modal: "Modal: pago",
  html_player_modal: "Modal: jugador",
  html_tournament_editor: "Modal: torneo",
  html_training_plan_editor: "Modal: plan de entrenamiento",
  html_training_session_modal: "Modal: sesión de entrenamiento",
  html_tournament_roster: "Torneos: roster (página)",
};

// HTML con data-tx: el editor lee los textos por defecto de acá.
export const HTML_SOURCES = [
  "/admin.html",
  "/association.html",
  "/attendance.html",
  "/community.html",
  "/dashboard.html",
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
