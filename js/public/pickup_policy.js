// /js/public/pickup_policy.js
// Página pública: política de cancelación + reembolsos/crédito (textos en Pickups > Ajustes).
import { initPublicMinimalHeader } from "/js/components/public-minimal-header.js";
import { showLoader, hideLoader } from "/js/ui/loader.js";
import {
  applyStrings,
  getPickupSettings,
  loadPickupSettings,
  pageText,
  richText,
  t,
} from "/js/features/pickups/pickups_settings.js";
import { whatsappUrl } from "/js/features/pickups/pickups_shared.js";

const $ = (id) => document.getElementById(id);

(async function init() {
  showLoader();
  try {
    await loadPickupSettings();
    applyStrings();
    document.title = t("policy.pageTitle");
    await initPublicMinimalHeader({ activeTab: "home", brandHref: "/index.html" });

    const s = getPickupSettings();
    const vars = { hours: s.defaultCancellationHours };
    $("ppCancellation").innerHTML = richText(pageText("policyCancellation", "policy.cancellationBody", vars));
    $("ppRefunds").innerHTML = richText(pageText("policyRefunds", "policy.refundsBody", vars));

    const contact = s.contact?.whatsapp || s.payment.sinpeNumber;
    if (contact) {
      $("ppContact").href = whatsappUrl(contact, t("wa.contact"), s.whatsappCountryCode);
      $("ppContact").classList.remove("d-none");
    }

    // volver al pickup desde el que se llegó (si es del mismo sitio)
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.origin === window.location.origin && ref.pathname.startsWith("/public/pickup")) {
      $("ppBack").href = ref.pathname + ref.search;
    }
  } catch (err) {
    console.error("[pickup_policy] init error:", err);
  } finally {
    hideLoader();
    document.documentElement.classList.remove("preload");
  }
})();
