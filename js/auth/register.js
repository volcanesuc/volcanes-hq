import { auth } from "./firebase.js";
import { logout } from "./auth.js";
import { loadHeader } from "../components/header.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { $ } from "../features/register/register_dom.js";
import {
  applyPrefillFromSession,
  applyModeFromQuery,
  fillProvinceCanton,
  refreshCommitteeUI,
  refreshRegisterTypeUI,
  setSubmittingState,
  showAlert,
  updateSubmitState,
  wireUpFormCompleteness,
  needsIdentityFields
} from "../features/register/register_ui.js";
import { loadPublicRegConfig } from "../features/register/register_config.js";
import {
  getUserAccessState,
  normalizePlayerStatus,
  normalizeAssociationStatus,
} from "../features/register/register_services.js";
import { loadPlans, bindPlanUI } from "../features/register/register_plans.js";
import { getPlansById } from "../features/register/register_state.js";
import { bindRegisterSubmit } from "../features/register/register_submit.js";

/* =========================
   UI boot safety
========================= */
function releaseUI() {
  document.documentElement.classList.remove("preload");
  document.body.classList.remove("loading");
}

releaseUI();

const url = new URL(location.href);
const created = url.searchParams.get("created");
if (created === "0" || created === "1") {
  releaseUI();
}

setTimeout(releaseUI, 2000);
window.addEventListener("error", releaseUI);
window.addEventListener("unhandledrejection", releaseUI);

/* =========================
   Header
========================= */
loadHeader("home", { enabledTabs: {} });

/* =========================
   Session prefill
========================= */
applyPrefillFromSession();

/* =========================
   Auth UI
========================= */
$.logoutBtn?.addEventListener("click", async () => {
  try {
    showLoader("Cargando…");
    await logout();
  } finally {
    hideLoader();
  }
});

onAuthStateChanged(auth, async (user) => {
  showLoader("Cargando…");

  try {
    if (!user) {
      $.logoutBtn?.classList.add("d-none");
      if ($.email) $.email.readOnly = false;
      return;
    }

    const access = await getUserAccessState(user.uid);
    const data = access.raw || {};

    if (!access.onboardingComplete) {
      if (user.email && $.email) {
        $.email.value = user.email;
        $.email.readOnly = true;
        $.logoutBtn?.classList.remove("d-none");
      } else {
        if ($.email) $.email.readOnly = false;
        $.logoutBtn?.classList.add("d-none");
      }

      const profile = data.profile || {};
      const residence = profile.residence || {};
      const emergencyContact = profile.emergencyContact || data.emergencyContact || {};
      const registration = data.registration || {};
      const savedType = profile.registerType || registration.type || "";

      if ($.firstName && !$.firstName.value && profile.firstName) {
        $.firstName.value = profile.firstName;
      }
      if ($.lastName && !$.lastName.value && profile.lastName) {
        $.lastName.value = profile.lastName;
      }
      if ($.idType && !$.idType.value && profile.idType) {
        $.idType.value = profile.idType;
      }
      if ($.idNumber && !$.idNumber.value && profile.idNumber) {
        $.idNumber.value = profile.idNumber;
      }
      if ($.phone && !$.phone.value && (profile.phone || data.phone)) {
        $.phone.value = profile.phone || data.phone;
      }

      if ($.emergencyContactName && !$.emergencyContactName.value) {
        if (typeof emergencyContact === "string") {
          $.emergencyContactName.value = emergencyContact;
        } else if (emergencyContact.name) {
          $.emergencyContactName.value = emergencyContact.name;
        }
      }

      if ($.province && !$.province.value && residence.province) {
        $.province.value = residence.province;
        $.province.dispatchEvent(new Event("change"));
      }

      if ($.canton && !$.canton.value && residence.canton) {
        if (!$.province.value && residence.province) {
          $.province.value = residence.province;
          $.province.dispatchEvent(new Event("change"));
        }
        $.canton.value = residence.canton;
      }

      if ($.committeeInterest && profile.committeeInterest === true) {
        $.committeeInterest.checked = true;
      }
      if ($.profession && profile.profession) {
        $.profession.value = profile.profession;
      }
      if ($.skills && profile.skills) {
        $.skills.value = profile.skills;
      }

      if (savedType === "pickups" && $.registerTypePickups) {
        $.registerTypePickups.checked = true;
      } else if (
        (savedType === "club_player" || savedType === "volcanes") &&
        $.registerTypeClubPlayer
      ) {
        $.registerTypeClubPlayer.checked = true;
      } else if (
        (savedType === "association_member" || savedType === "asovoca") &&
        $.registerTypeAssociationMember
      ) {
        $.registerTypeAssociationMember.checked = true;
      }

      refreshRegisterTypeUI();
      refreshCommitteeUI();
      updateSubmitState();
      return;
    }

    const playerStatus = normalizePlayerStatus(data);
    const associationStatus = normalizeAssociationStatus(data);
    const canUsePickupsFlag = data.canUsePickups === true;

    if (playerStatus === "active") {
      window.location.replace("/dashboard.html");
      return;
    }

    if (associationStatus === "pending" || associationStatus === "active") {
      window.location.replace("/member_status.html");
      return;
    }

    if (playerStatus === "pending") {
      window.location.replace("/index.html?state=platform_pending");
      return;
    }

    if (canUsePickupsFlag) {
      window.location.replace("/pickups_status.html");
      return;
    }

    window.location.replace("/index.html");
  } catch (e) {
    console.warn("onAuthStateChanged handler failed:", e);
  } finally {
    hideLoader();
    releaseUI();
  }
});

/* =========================
   Init
========================= */
async function init() {
  showLoader("Procesando registro…");
  setSubmittingState(true, "Cargando...");
  try {
    fillProvinceCanton();
    wireUpFormCompleteness();
    bindPlanUI(getPlansById);
    await loadPlans();
    await loadPublicRegConfig();
    applyModeFromQuery();
    refreshRegisterTypeUI();
    updateSubmitState();
  } catch (e) {
    console.warn(e);
    showAlert("No se pudo cargar la configuración. Refresca la página.");
  } finally {
    setSubmittingState(false);
    hideLoader();
    releaseUI();
    updateSubmitState();
    document.body.classList.remove("loading");
  }
}

bindRegisterSubmit();
init();