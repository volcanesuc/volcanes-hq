import { db } from "/js/auth/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { $ } from "./register_dom.js";
import { PUBLIC_CFG, setPublicConfig } from "./register_state.js";
import {
  esc,
  setEnabled,
  setRequired,
  refreshMembershipPaymentUI,
  updateSubmitState,
} from "./register_ui.js";

const CFG_DOC = doc(db, "club_config", "public_registration");

export function renderAssociationDetails(container, data) {
  if (!container) return;

  const details = data?.association_details || {};
  const enabled = details.enabled !== false;

  container.classList.toggle("d-none", !enabled);

  if (!enabled) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div class="intro-box">
      <h3 class="mb-3" style="color: var(--theme-primary); font-weight: 900;">
        ${esc(details.title || "Asociación")}
      </h3>

      <div class="mb-3">${details.introHtml || ""}</div>

      ${
        details.feesTitle
          ? `<p class="mb-2"><strong>${esc(details.feesTitle)}</strong></p>`
          : ""
      }

      ${details.feeParagraph1 ? `<p>${details.feeParagraph1}</p>` : ""}
      ${details.feeParagraph2 ? `<p>${details.feeParagraph2}</p>` : ""}

      ${
        details.exceptionsText
          ? `<p class="mb-0">${esc(details.exceptionsText)}</p>`
          : ""
      }
    </div>
  `;
}

export function applyPublicConfigToUI(cfg = {}) {
  setPublicConfig({
    enableMembershipPayment: cfg.enableMembershipPayment !== false,
    requireTerms: cfg.requireTerms === true,
    requireInfoDeclaration: cfg.requireInfoDeclaration === true,
    termsUrl: cfg.termsUrl || null,
    requireAssociationTerms: cfg.requireAssociationTerms === true,
    associationTermsUrl: cfg.associationTermsUrl || null,
    associationDetails: cfg.association_details || {},
  });

  renderAssociationDetails($.associationDetailsSection, cfg);

  if (PUBLIC_CFG.requireInfoDeclaration) {
    $.declarationWrap?.classList.remove("d-none");
    setEnabled($.infoDeclaration, true);
    setRequired($.infoDeclaration, true);

    if (cfg.infoDeclarationText && $.infoDeclarationLabel) {
      $.infoDeclarationLabel.textContent = cfg.infoDeclarationText;
    }
  } else {
    $.declarationWrap?.classList.add("d-none");
    if ($.infoDeclaration) $.infoDeclaration.checked = false;
    setEnabled($.infoDeclaration, false);
    setRequired($.infoDeclaration, false);
  }

  if (PUBLIC_CFG.requireTerms) {
    $.termsWrap?.classList.remove("d-none");
    setEnabled($.termsAccepted, true);
    setRequired($.termsAccepted, true);

    if ($.termsLink) {
      $.termsLink.href = PUBLIC_CFG.termsUrl || "#";
      $.termsLink.style.display = PUBLIC_CFG.termsUrl ? "inline" : "none";
    }
  } else {
    $.termsWrap?.classList.add("d-none");
    if ($.termsAccepted) $.termsAccepted.checked = false;
    setEnabled($.termsAccepted, false);
    setRequired($.termsAccepted, false);
  }

  if (PUBLIC_CFG.requireAssociationTerms) {
    $.associationTermsWrap?.classList.remove("d-none");
    setEnabled($.associationTermsAccepted, true);
    setRequired($.associationTermsAccepted, true);

    if ($.associationTermsLink) {
      $.associationTermsLink.href = PUBLIC_CFG.associationTermsUrl || "#";
      $.associationTermsLink.style.display = PUBLIC_CFG.associationTermsUrl ? "inline" : "none";
    }
  } else {
    $.associationTermsWrap?.classList.add("d-none");
    if ($.associationTermsAccepted) $.associationTermsAccepted.checked = false;
    setEnabled($.associationTermsAccepted, false);
    setRequired($.associationTermsAccepted, false);
  }

  refreshMembershipPaymentUI();
  updateSubmitState();

  return PUBLIC_CFG;
}

export async function loadPublicRegConfig() {
  const snap = await getDoc(CFG_DOC);
  const cfg = snap.exists() ? snap.data() : {};
  return applyPublicConfigToUI(cfg);
}