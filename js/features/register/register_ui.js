import { $ } from "./register_dom.js";
import { PUBLIC_CFG } from "./register_state.js";

/* =========================
   Generic helpers
========================= */
export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function norm(s) {
  return (s || "").toString().trim();
}

export function normLower(s) {
  return norm(s).toLowerCase();
}

export function cleanIdNum(s) {
  return norm(s).replace(/\s+/g, "");
}

export function fmtMoney(n, cur = "CRC") {
  const v = Number(n);
  if (Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency: cur,
  }).format(v);
}

export function safeSeasonFromToday() {
  return String(new Date().getFullYear());
}

export function isVisible(el) {
  if (!el) return false;
  if (el.classList?.contains("d-none")) return false;
  if (el.hidden) return false;
  return !!(el.offsetParent || el.getClientRects().length);
}

export function hasValue(el) {
  if (!el) return false;
  if (el.type === "checkbox") return !!el.checked;
  if (el.type === "file") return (el.files?.length || 0) > 0;
  return String(el.value || "").trim().length > 0;
}

export function setRequired(el, required) {
  if (!el) return;
  if (required) el.setAttribute("required", "required");
  else el.removeAttribute("required");
}

export function setEnabled(el, enabled) {
  if (!el) return;
  el.disabled = !enabled;
}

/* =========================
   Alerts / submit
========================= */
export function showAlert(msg, type = "danger") {
  if (!$.alertBox) return;
  $.alertBox.className = `alert alert-${type}`;
  $.alertBox.innerHTML = String(msg || "").replace(/\n/g, "<br>");
  $.alertBox.classList.remove("d-none");
}

export function hideAlert() {
  $.alertBox?.classList.add("d-none");
}

export function setSubmitEnabled(enabled) {
  if (!$.submitBtn) return;
  $.submitBtn.disabled = !enabled;
  $.submitBtn.classList.toggle("disabled", !enabled);
  $.submitBtn.classList.remove("btn-primary", "btn-success", "btn-secondary");
  $.submitBtn.classList.add(enabled ? "btn-success" : "btn-secondary");
}

export function setSubmittingState(isSubmitting, label = "Enviar registro") {
  if (!$.submitBtn) return;

  $.submitBtn.disabled = isSubmitting;

  if (isSubmitting) {
    $.submitBtn.dataset.originalHtml ||= $.submitBtn.innerHTML;
    $.submitBtn.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      ${esc(label)}
    `;
  } else if ($.submitBtn.dataset.originalHtml) {
    $.submitBtn.innerHTML = $.submitBtn.dataset.originalHtml;
  }

  if (!isSubmitting) updateSubmitState();
}

/* =========================
   Register type helpers
========================= */
export function getSelectedRegisterType() {
  const checked = [...$.registerTypeRadios].find((r) => r.checked);
  return checked?.value || "";
}

export function isPickups() {
  return getSelectedRegisterType() === "pickups";
}

export function isClubPlayer() {
  return getSelectedRegisterType() === "club_player";
}

export function isAssociationMember() {
  return getSelectedRegisterType() === "association_member";
}

export function needsIdentityFields() {
  return isClubPlayer() || isAssociationMember();
}

export function shouldEnableMembershipPaymentUI() {
  return PUBLIC_CFG.enableMembershipPayment && isAssociationMember();
}

/* =========================
   Proof upload UI
========================= */
export function ensureProofStatusBox() {
  let el = document.getElementById("proofUploadStatus");
  if (el) return el;

  el = document.createElement("div");
  el.id = "proofUploadStatus";
  el.className = "small mt-2 d-none";
  $.proofFile?.insertAdjacentElement("afterend", el);
  return el;
}

export function setProofStatus(message, type = "muted", withSpinner = false) {
  const el = ensureProofStatusBox();
  if (!el) return;

  const cls =
    type === "danger"
      ? "text-danger"
      : type === "success"
        ? "text-success"
        : type === "warning"
          ? "text-warning"
          : "text-muted";

  el.className = `small mt-2 ${cls}`;
  el.innerHTML = withSpinner
    ? `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      <span>${esc(message)}</span>
    `
    : `<span>${esc(message)}</span>`;

  el.classList.remove("d-none");
}

export function clearProofStatus() {
  const el = document.getElementById("proofUploadStatus");
  if (!el) return;
  el.innerHTML = "";
  el.classList.add("d-none");
}

/* =========================
   Form completeness
========================= */
export function computeFormComplete() {
  const registerType = getSelectedRegisterType();
  if (!registerType) return false;

  const requiredEls = [
    $.firstName,
    $.lastName,
    $.phone,
    $.emergencyContactName,
  ];

  if (needsIdentityFields()) {
    requiredEls.push($.email, $.idType, $.idNumber, $.province, $.canton);
  }

  if (shouldEnableMembershipPaymentUI()) {
    requiredEls.push($.planId, $.proofFile);
  }

  if (PUBLIC_CFG.requireInfoDeclaration) {
    requiredEls.push($.infoDeclaration);
  }

  if (PUBLIC_CFG.requireTerms) {
    requiredEls.push($.termsAccepted);
  }

  if (isAssociationMember() && PUBLIC_CFG.requireAssociationTerms) {
    requiredEls.push($.associationTermsAccepted);
  }

  return requiredEls
    .filter((el) => isVisible(el))
    .every((el) => hasValue(el));
}

export function updateSubmitState() {
  setSubmitEnabled(computeFormComplete());
}

/* =========================
   Section toggles
========================= */
export function refreshCommitteeUI() {
  const show = isAssociationMember() && !!$.committeeInterest?.checked;
  $.committeeFields?.classList.toggle("d-none", !show);
}

export function refreshMembershipPaymentUI() {
  const enabled = shouldEnableMembershipPaymentUI();

  if (!enabled) {
    $.paymentSection?.classList.add("d-none");
    setEnabled($.planId, false);
    setEnabled($.proofFile, false);
    setRequired($.planId, false);
    setRequired($.proofFile, false);

    if ($.planId) $.planId.value = "";
    if ($.proofFile) $.proofFile.value = "";
    if ($.planMeta) $.planMeta.textContent = "";

    clearProofStatus();
  } else {
    $.paymentSection?.classList.remove("d-none");
    setEnabled($.planId, true);
    setEnabled($.proofFile, true);
    setRequired($.planId, true);
    setRequired($.proofFile, true);
  }

  updateSubmitState();
}

export function refreshRegisterTypeUI() {
  const type = getSelectedRegisterType();

  $.cardPickups?.classList.toggle("active", type === "pickups");
  $.cardClubPlayer?.classList.toggle("active", type === "club_player");
  $.cardAssociationMember?.classList.toggle("active", type === "association_member");

  if (!type) {
    $.commonSection?.classList.add("d-none");
    $.identitySection?.classList.add("d-none");
    $.associationSection?.classList.add("d-none");
    clearProofStatus();
    updateSubmitState();
    return;
  }

  $.commonSection?.classList.remove("d-none");
  $.identitySection?.classList.toggle("d-none", !needsIdentityFields());
  $.associationSection?.classList.toggle("d-none", !isAssociationMember());

  refreshMembershipPaymentUI();
  refreshCommitteeUI();
  updateSubmitState();
}

/* =========================
   Costa Rica province/canton
========================= */
const CR = {
  "San José": [
    "San José", "Escazú", "Desamparados", "Puriscal", "Tarrazú", "Aserrí", "Mora",
    "Goicoechea", "Santa Ana", "Alajuelita", "Vásquez de Coronado", "Acosta", "Tibás",
    "Moravia", "Montes de Oca", "Turrubares", "Dota", "Curridabat", "Pérez Zeledón",
    "León Cortés Castro",
  ],
  "Alajuela": [
    "Alajuela", "San Ramón", "Grecia", "San Mateo", "Atenas", "Naranjo", "Palmares",
    "Poás", "Orotina", "San Carlos", "Zarcero", "Sarchí", "Upala", "Los Chiles",
    "Guatuso", "Río Cuarto",
  ],
  "Cartago": [
    "Cartago", "Paraíso", "La Unión", "Jiménez", "Turrialba", "Alvarado", "Oreamuno", "El Guarco",
  ],
  "Heredia": [
    "Heredia", "Barva", "Santo Domingo", "Santa Bárbara", "San Rafael", "San Isidro",
    "Belén", "Flores", "San Pablo", "Sarapiquí",
  ],
  "Guanacaste": [
    "Liberia", "Nicoya", "Santa Cruz", "Bagaces", "Carrillo", "Cañas", "Abangares",
    "Tilarán", "Nandayure", "La Cruz", "Hojancha",
  ],
  "Puntarenas": [
    "Puntarenas", "Esparza", "Buenos Aires", "Montes de Oro", "Osa", "Quepos", "Golfito",
    "Coto Brus", "Parrita", "Corredores", "Garabito",
  ],
  "Limón": [
    "Limón", "Pococí", "Siquirres", "Talamanca", "Matina", "Guácimo",
  ],
};

export function fillProvinceCanton() {
  const provinces = Object.keys(CR);

  if ($.province) {
    $.province.innerHTML =
      `<option value="">Seleccionar…</option>` +
      provinces.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
  }

  if ($.canton) {
    $.canton.innerHTML = `<option value="">Seleccionar…</option>`;
  }

  $.province?.addEventListener("change", () => {
    const p = $.province.value;
    const cantons = CR[p] || [];

    if ($.canton) {
      $.canton.innerHTML =
        `<option value="">Seleccionar…</option>` +
        cantons.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    }
  });
}

/* =========================
   Query/session helpers
========================= */
export function applyModeFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");

  if (mode === "upgrade_player" && $.registerTypeClubPlayer) {
    $.registerTypeClubPlayer.checked = true;
  }

  if (mode === "upgrade_member" && $.registerTypeAssociationMember) {
    $.registerTypeAssociationMember.checked = true;
  }

  refreshRegisterTypeUI();
  refreshCommitteeUI();
  updateSubmitState();
}

export function applyPrefillFromSession() {
  try {
    const raw = sessionStorage.getItem("prefill_register");
    if (!raw) return;

    const p = JSON.parse(raw);

    if ($.email && p.email) {
      $.email.value = p.email;
      $.email.readOnly = true;
    }
    if ($.firstName && !$.firstName.value && p.firstName) {
      $.firstName.value = p.firstName;
    }
    if ($.lastName && !$.lastName.value && p.lastName) {
      $.lastName.value = p.lastName;
    }
    if ($.phone && p.phone && !$.phone.value) {
      $.phone.value = p.phone;
    }
  } catch (e) {
    console.warn("prefill_register invalid", e);
  }
}

/* =========================
   Boot listeners
========================= */
export function wireUpFormCompleteness() {
  const els = [
    ...$.registerTypeRadios,
    $.firstName,
    $.lastName,
    $.phone,
    $.email,
    $.idType,
    $.idNumber,
    $.emergencyContactName,
    $.province,
    $.canton,
    $.planId,
    $.proofFile,
    $.infoDeclaration,
    $.termsAccepted,
    $.associationTermsAccepted,
    $.committeeInterest,
    $.profession,
    $.skills,
  ].filter(Boolean);

  els.forEach((el) => {
    el.addEventListener("input", updateSubmitState);
    el.addEventListener("change", updateSubmitState);
  });

  $.registerTypeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      refreshRegisterTypeUI();
      refreshCommitteeUI();
      updateSubmitState();
    });
  });

  $.committeeInterest?.addEventListener("change", () => {
    refreshCommitteeUI();
    updateSubmitState();
  });

  $.province?.addEventListener("change", () => setTimeout(updateSubmitState, 0));

  updateSubmitState();
}