export const $ = {
  alertBox: document.getElementById("alertBox"),
  form: document.getElementById("registerForm"),
  submitBtn: document.getElementById("submitBtn"),
  logoutBtn: document.getElementById("logoutBtn"),

  registerTypeRadios: document.querySelectorAll('input[name="registerType"]'),
  registerTypePickups: document.getElementById("registerTypePickups"),
  registerTypeClubPlayer: document.getElementById("registerTypeClubPlayer"),
  registerTypeAssociationMember: document.getElementById("registerTypeAssociationMember"),

  cardPickups: document.getElementById("card-pickups"),
  cardClubPlayer: document.getElementById("card-club-player"),
  cardAssociationMember: document.getElementById("card-association-member"),

  commonSection: document.getElementById("commonSection"),
  identitySection: document.getElementById("identitySection"),
  associationSection: document.getElementById("associationSection"),
  associationDetailsSection: document.getElementById("associationDetailsSection"),
  committeeFields: document.getElementById("committeeFields"),

  firstName: document.getElementById("firstName"),
  lastName: document.getElementById("lastName"),
  email: document.getElementById("email"),
  idType: document.getElementById("idType"),
  idNumber: document.getElementById("idNumber"),
  phone: document.getElementById("phone"),
  emergencyContactName: document.getElementById("emergencyContactName"),

  province: document.getElementById("province"),
  canton: document.getElementById("canton"),

  paymentSection: document.getElementById("paymentSection"),
  planId: document.getElementById("planId"),
  planMeta: document.getElementById("planMeta"),
  proofFile: document.getElementById("proofFile"),

  committeeInterest: document.getElementById("committeeInterest"),
  profession: document.getElementById("profession"),
  skills: document.getElementById("skills"),

  declarationWrap: document.getElementById("declarationWrap"),
  infoDeclaration: document.getElementById("infoDeclaration"),
  infoDeclarationLabel: document.getElementById("infoDeclarationLabel"),

  termsWrap: document.getElementById("termsWrap"),
  termsAccepted: document.getElementById("termsAccepted"),
  termsLink: document.getElementById("termsLink"),

  associationTermsWrap: document.getElementById("associationTermsWrap"),
  associationTermsAccepted: document.getElementById("associationTermsAccepted"),
  associationTermsLink: document.getElementById("associationTermsLink"),
};