import { auth } from "/js/auth/firebase.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";

import { $ } from "./register_dom.js";
import { PUBLIC_CFG, plansById } from "./register_state.js";
import {
  norm,
  normLower,
  cleanIdNum,
  hideAlert,
  showAlert,
  setSubmittingState,
  setProofStatus,
  needsIdentityFields,
  isClubPlayer,
  isAssociationMember,
} from "./register_ui.js";
import { loadPublicRegConfig } from "./register_config.js";
import {
  step,
  ensureUserDoc,
  saveUserProfileAndConsents,
  uploadProofFile,
  createMembership,
  maybeCreateInstallments,
  syncUserMembershipSummary,
  createPaymentSubmission,
  markUserOnboardingComplete,
  buildEmergencyContact,
  buildResidence,
  resolveSeason,
  firebaseErrMsg,
} from "./register_services.js";
import { TX } from "/js/strings/screens/register_submit.js";

function getSelectedRegisterType() {
  const checked = [...$.registerTypeRadios].find((r) => r.checked);
  return checked?.value || "";
}

function canUseMembershipPayment() {
  return isAssociationMember() && PUBLIC_CFG.enableMembershipPayment;
}

function buildSubmitSnapshot() {
  const user = auth.currentUser;

  const registerType = getSelectedRegisterType();
  const firstName = norm($.firstName?.value);
  const lastName = norm($.lastName?.value);
  const phone = norm($.phone?.value);
  const emergencyContactName = norm($.emergencyContactName?.value);

  const email = user?.email
    ? String(user.email).toLowerCase()
    : normLower($.email?.value);

  const idType = normLower($.idType?.value);
  const idNumber = cleanIdNum($.idNumber?.value);

  const residence = needsIdentityFields()
    ? buildResidence({
        province: $.province?.value,
        canton: $.canton?.value,
      })
    : null;

  const emergencyContact = buildEmergencyContact(emergencyContactName);

  const committeeInterest = !!$.committeeInterest?.checked;
  const profession = norm($.profession?.value);
  const skills = norm($.skills?.value);

  const wantsPlayer = isClubPlayer();
  const wantsMembershipPayment = canUseMembershipPayment();
  const canUsePickups = true;

  const planId = norm($.planId?.value);
  const plan = plansById.get(planId);
  const file = $.proofFile?.files?.[0] || null;

  return {
    user,
    registerType,
    firstName,
    lastName,
    phone,
    emergencyContactName,
    email,
    idType,
    idNumber,
    residence,
    emergencyContact,
    committeeInterest,
    profession,
    skills,
    wantsPlayer,
    wantsMembershipPayment,
    canUsePickups,
    planId,
    plan,
    file,
  };
}

function validateSubmitSnapshot(data, cfg) {
  if (!data.user?.uid) {
    throw new Error(TX.primeroIngresaConGoogle);
  }

  if (!data.registerType) {
    throw new Error(TX.seleccionaUnTipoDe);
  }

  if (!data.firstName || !data.lastName || !data.phone || !data.emergencyContactName) {
    throw new Error(TX.completaNombreApellidoTelefono);
  }

  if (needsIdentityFields()) {
    if (!data.email || !data.idType || !data.idNumber) {
      throw new Error(TX.debesCompletarCorreoTipo);
    }

    if (!data.residence?.province || !data.residence?.canton) {
      throw new Error(TX.debesSeleccionarProvinciaY);
    }
  }

  if (data.wantsMembershipPayment) {
    if (!data.planId || !data.plan) {
      throw new Error(TX.seleccionaUnPlanDe);
    }

    if (!data.file) {
      throw new Error(TX.adjuntaElComprobanteDe);
    }
  }

  if (cfg.requireInfoDeclaration && !$.infoDeclaration?.checked) {
    throw new Error(TX.debesAceptarLaDeclaracion);
  }

  if (cfg.requireTerms && !$.termsAccepted?.checked) {
    throw new Error(TX.debesAceptarLosTerminos);
  }

  if (
    isAssociationMember() &&
    cfg.requireAssociationTerms &&
    !$.associationTermsAccepted?.checked
  ) {
    throw new Error(TX.debesAceptarLosTerminos2);
  }
}

function buildConsents(cfg) {
  return {
    requireInfoDeclaration: !!cfg.requireInfoDeclaration,
    infoDeclarationAccepted: cfg.requireInfoDeclaration ? true : null,

    requireTerms: !!cfg.requireTerms,
    termsAccepted: cfg.requireTerms ? true : null,
    termsUrl: cfg.termsUrl || null,

    requireAssociationTerms: isAssociationMember() ? !!cfg.requireAssociationTerms : false,
    associationTermsAccepted:
      isAssociationMember() && cfg.requireAssociationTerms ? true : null,
    associationTermsUrl:
      isAssociationMember() ? cfg.associationTermsUrl || null : null,
  };
}

function redirectAfterSubmit({
  wantsPlayer,
  wantsMembershipPayment,
  canUsePickups,
}) {
  if (wantsPlayer) {
    window.location.replace("/index.html?state=platform_pending");
    return;
  }

  if (wantsMembershipPayment) {
    window.location.replace("/member_status.html");
    return;
  }

  if (canUsePickups) {
    window.location.replace("/pickups_status.html");
    return;
  }

  window.location.replace("/index.html");
}

async function runRegisterSubmit() {
  const snapshot = buildSubmitSnapshot();
  const cfg = await loadPublicRegConfig();

  validateSubmitSnapshot(snapshot, cfg);

  const consents = buildConsents(cfg);
  const uid = snapshot.user.uid;

  await step(TX.ensureUsers, () =>
    ensureUserDoc(uid, snapshot.email)
  );

  const userSnapshot = await step(TX.saveUserProfileConsents, () =>
    saveUserProfileAndConsents({
      uid,
      email: needsIdentityFields() ? snapshot.email : (snapshot.user.email || null),
      firstName: snapshot.firstName,
      lastName: snapshot.lastName,
      idType: needsIdentityFields() ? snapshot.idType : null,
      idNumber: needsIdentityFields() ? snapshot.idNumber : null,
      phone: snapshot.phone,
      residence: snapshot.residence,
      emergencyContact: snapshot.emergencyContact,
      registerType: snapshot.registerType,
      committeeInterest: snapshot.committeeInterest,
      profession: snapshot.committeeInterest ? snapshot.profession : null,
      skills: snapshot.committeeInterest ? snapshot.skills : null,
      consents,
    })
  );

  if (snapshot.wantsMembershipPayment) {
    const proof = await step(TX.uploadProofStorage, () =>
      uploadProofFile({
        uid,
        file: snapshot.file,
      })
    );

    const season = resolveSeason(snapshot.plan);

    const { membershipId } = await step(TX.createMembership, () =>
      createMembership({
        uid,
        userSnapshot,
        plan: { id: snapshot.planId, ...snapshot.plan },
        season,
        consents,
      })
    );

    await step(TX.maybeCreateInstallments, () =>
      maybeCreateInstallments({
        membershipId,
        plan: { id: snapshot.planId, ...snapshot.plan },
        season,
      })
    );

    await step(TX.createPaymentSubmission, () =>
      createPaymentSubmission({
        uid,
        email: snapshot.email,
        firstName: snapshot.firstName,
        lastName: snapshot.lastName,
        phone: snapshot.phone,
        plan: snapshot.plan,
        planId: snapshot.planId,
        season,
        membershipId,
        proof,
      })
    );

    await step(TX.syncUserMembershipSummary, () =>
      syncUserMembershipSummary({
        uid,
        membershipId,
        plan: { id: snapshot.planId, ...snapshot.plan },
        season,
      })
    );
  }

  await step(TX.markOnboardingCompleteUsers, () =>
    markUserOnboardingComplete({
      uid,
      email: snapshot.email || snapshot.user.email || null,
      phone: snapshot.phone,
      emergencyContact: snapshot.emergencyContact,
      registerType: snapshot.registerType,
      wantsPlayer: snapshot.wantsPlayer,
      wantsMembershipPayment: snapshot.wantsMembershipPayment,
      committeeInterest: snapshot.committeeInterest,
      canUsePickups: snapshot.canUsePickups,
    })
  );

  sessionStorage.removeItem("prefill_register");

  redirectAfterSubmit({
    wantsPlayer: snapshot.wantsPlayer,
    wantsMembershipPayment: snapshot.wantsMembershipPayment,
    canUsePickups: snapshot.canUsePickups,
  });
}

export function bindRegisterSubmit() {
  $.form?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    hideAlert();

    showLoader(TX.cargando);
    setSubmittingState(true, TX.enviando);

    try {
      await runRegisterSubmit();
    } catch (e) {
      console.warn(e);

      const msg =
        e instanceof Error
          ? e.message
          : firebaseErrMsg(e) || TX.ocurrioUnErrorInesperado;

      showAlert(msg, "danger");

      if (/upload proof|storage|comprobante/i.test(msg)) {
        setProofStatus(msg, "danger", false);
      }
    } finally {
      setSubmittingState(false);
      hideLoader();
    }
  });
}