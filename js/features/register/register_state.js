export const PUBLIC_CFG = {
  enableMembershipPayment: true,
  requireTerms: false,
  requireInfoDeclaration: false,
  termsUrl: null,
  requireAssociationTerms: false,
  associationTermsUrl: null,
  associationDetails: {},
};

export let plansById = new Map();

export function setPublicConfig(nextCfg = {}) {
  Object.assign(PUBLIC_CFG, nextCfg || {});
}

export function setPlansById(nextMap) {
  plansById = nextMap instanceof Map ? nextMap : new Map();
}

export function getPlansById() {
  return plansById;
}