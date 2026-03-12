// /js/components/public-minimal-header.js
import { loadHeader } from "/js/components/header.js";

export async function initPublicMinimalHeader({
  activeTab = "home",
  brandHref = "/index.html",
  hideHamburger = true,
  bodyClass = "public-minimal-header",
} = {}) {
  try {
    await loadHeader(activeTab, {
      enabledTabs: {}
    });

    document.body.classList.add(bodyClass);
    document.getElementById("app-header")?.classList.add(bodyClass);

    const brand = document.querySelector("#app-header .logo-link");
    if (brand) {
      brand.style.cursor = "pointer";
      brand.addEventListener("click", (ev) => {
        ev.preventDefault();
        window.location.href = brandHref;
      });
    }

    const selectorsToHide = [
      "#app-header .top-tabs",
      "#app-header .mobile-links",
      "#app-header hr"
    ];

    selectorsToHide.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        el.style.display = "none";
      });
    });

    if (hideHamburger) {
      document.querySelectorAll("#app-header .hamburger").forEach((el) => {
        el.style.display = "none";
      });
    }
  } catch (err) {
    console.warn("No se pudo cargar el header público minimal:", err);
  }
}