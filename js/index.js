import "./config/config.js";
import { CLUB_DATA } from "./strings.js";
import { loadHeader } from "./components/header.js";
import { showLoader, hideLoader, updateLoaderMessage } from "./ui/loader.js";
import { db, auth } from "/js/auth/firebase.js";
import { logout } from "/js/auth/auth.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { APP_CONFIG } from "./config/config.js";

const COL = APP_CONFIG.collections;
const COL_CLUB_CONFIG = COL.club_config;
const COL_USERS = COL.users;

const url = new URL(window.location.href);
const isPendingView = url.searchParams.get("pending") === "1";

const pendingSection = document.getElementById("pendingApprovalSection");
const pendingRetryBtn = document.getElementById("pendingRetryBtn");
const pendingLogoutBtn = document.getElementById("pendingLogoutBtn");

/* =========================================================
   PENDING MODE
========================================================= */

function showPendingState() {
  pendingSection?.classList.remove("d-none");

  const sectionsToHide = [
    "eventsSection",
    "entrenamientos",
    "honorsSection",
    "uniformsSection",
  ];

  sectionsToHide.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });

  const hero = document.querySelector(".hero");
  if (hero) hero.style.display = "none";

  const heroSocialsWrap = document.getElementById("heroSocialsWrap");
  if (heroSocialsWrap) heroSocialsWrap.style.display = "none";

  const footer = document.querySelector(".landing-footer");
  if (footer) {
    footer.innerHTML = `
      <p>${CLUB_DATA.footer.copyright}</p>
      <p>Fundados en el ${CLUB_DATA.club.foundedYear}</p>
    `;
  }

  document.documentElement.classList.remove("preload");
  document.body.classList.remove("loading");
  hideLoader();
}

async function bootPendingMode() {
  showLoader("Validando estado…");

  onAuthStateChanged(auth, async (user) => {
    try {
      if (!user) {
        window.location.replace("/index.html");
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef).catch(() => null);
      const userData = userSnap?.exists?.() ? userSnap.data() || {} : {};

      if (userData.isActive === true && userData.onboardingComplete === true) {
        window.location.replace("/dashboard.html");
        return;
      }

      showPendingState();
    } catch (err) {
      console.error("Error validando pending state:", err);
      showPendingState();
    } finally {
      hideLoader();
    }
  });

  pendingRetryBtn?.addEventListener("click", async () => {
    showLoader("Revisando estado…");
    try {
      const user = auth.currentUser;
      if (!user?.uid) {
        window.location.replace("/index.html");
        return;
      }

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef).catch(() => null);
      const userData = userSnap?.exists?.() ? userSnap.data() || {} : {};

      if (userData.isActive === true && userData.onboardingComplete === true) {
        window.location.replace("/dashboard.html");
        return;
      }

      showPendingState();
    } catch (err) {
      console.error("Error reintentando validación:", err);
      showPendingState();
    } finally {
      hideLoader();
    }
  });

  pendingLogoutBtn?.addEventListener("click", async () => {
    try {
      showLoader("Cerrando sesión…");
      await logout({ redirectTo: "/index.html" });
    } finally {
      hideLoader();
    }
  });
}

/* =========================================================
   NORMAL INIT
========================================================= */

async function init() {
  try {
    showLoader("Validando sesión…");
    const { ready } = await loadHeader("home", { enabledTabs: {} });
    await ready;
    updateLoaderMessage("Armando dashboard…");
    hideLoader();
  } catch (err) {
    console.error("Error inicializando index:", err);
    hideLoader();
  }
}

/* =========================================================
   MANAGE SECTIONS TO BE SHOWN OR HIDDEN
========================================================= */

function setSectionVisible(sectionId, visible) {
  const el = document.getElementById(sectionId);
  if (!el) return;
  el.style.display = visible ? "" : "none";
}

function applyIndexSettings(indexSettings = {}) {
  const defaults = {
    show_events: true,
    show_trainings: true,
    show_honors: true,
    show_uniforms: true,
  };

  const s = { ...defaults, ...indexSettings };

  setSectionVisible("eventsSection", s.show_events);
  setSectionVisible("entrenamientos", s.show_trainings);
  setSectionVisible("honorsSection", s.show_honors);
  setSectionVisible("uniformsSection", s.show_uniforms);
}

async function loadIndexSettings() {
  try {
    const ref = doc(db, "club_config", "index_settings");
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      applyIndexSettings(data);
    } else {
      applyIndexSettings();
      console.error("No existe club_config/index_settings");
    }
  } catch (err) {
    console.error("Error loading index settings:", err);
    applyIndexSettings();
  }
}

/* =========================================================
   HERO
========================================================= */
async function loadHeroData() {
  const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "hero")).catch(() => null);
  const data = snap?.exists?.() ? (snap.data() || {}) : {};

  return {
    title: data.title || CLUB_DATA.landing.hero.title,
    description: data.description || CLUB_DATA.landing.hero.description,
    imageUrl: data.imageUrl || CLUB_DATA.landing.hero.image,
  };
}

function renderHero(heroData = {}) {
  const heroTitle = document.querySelector(".hero h2");
  const heroText = document.querySelector(".hero p");
  const heroImg = document.querySelector(".hero-img");

  if (heroTitle) {
    heroTitle.innerHTML = String(heroData.title || "").replace(",", ",<br>");
  }

  if (heroText) {
    heroText.textContent = heroData.description || "";
  }

  if (heroImg) {
    heroImg.src = heroData.imageUrl || "";
    heroImg.alt = CLUB_DATA.club.name;
  }
}

/* =========================================================
   SOCIALS
========================================================= */

function renderSocials(socials = {}) {
  const wrap = document.getElementById("heroSocialsWrap");
  const container = document.getElementById("heroSocials");
  if (!wrap || !container) return;

  const items = [
    { key: "instagram", label: "Instagram", icon: "bi-instagram" },
    { key: "facebook", label: "Facebook", icon: "bi-facebook" },
    { key: "tiktok", label: "TikTok", icon: "bi-tiktok" },
    { key: "youtube", label: "YouTube", icon: "bi-youtube" },
    { key: "x", label: "X", icon: "bi-twitter-x" },
    { key: "whatsappUrl", label: "WhatsApp", icon: "bi-whatsapp" },
  ].filter((item) => safeUrl(socials[item.key] || (item.key === "whatsappUrl" ? socials.whatsapp : "")));

  if (!items.length) {
    wrap.style.display = "none";
    return;
  }

  wrap.style.display = "";
  container.innerHTML = items.map((item) => {
    const href = item.key === "whatsappUrl"
      ? safeUrl(socials.whatsappUrl || socials.whatsapp || "")
      : safeUrl(socials[item.key]);

    return `
      <a
        class="hero-social-link"
        href="${href}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="${item.label}"
      >
        <i class="bi ${item.icon} hero-social-link__icon"></i>
        <span>${item.label}</span>
      </a>
    `;
  }).join("");
}

/* =========================================================
   EVENTS
========================================================= */
async function loadEventsData() {
  const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "events")).catch(() => null);
  const data = snap?.exists?.() ? (snap.data() || {}) : {};

  return {
    title: data.title || "",
    subtitle: data.subtitle || "",
    images: Array.isArray(data.images) ? data.images : [],
    ctaEnabled: data.ctaEnabled === true,
    ctaText: data.ctaText || "",
    ctaUrl: data.ctaUrl || "",
  };
}

function renderEvents(eventsData = {}) {
  const eventsSection = document.getElementById("eventsSection");
  if (!eventsSection) return;

  const titleEl = eventsSection.querySelector("h2");
  const descEl = eventsSection.querySelector("p");
  const eventsContainer = eventsSection.querySelector(".events");

  if (titleEl) titleEl.textContent = eventsData.title || "Evento";
  if (descEl) descEl.textContent = eventsData.subtitle || "";

  if (eventsContainer) {
    eventsContainer.innerHTML = "";

    (eventsData.images || []).forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = eventsData.title || "Evento";
      eventsContainer.appendChild(img);
    });
  }

  let ctaBtn = eventsSection.querySelector("#eventsCtaBtn");
  if (!ctaBtn) {
    ctaBtn = document.createElement("a");
    ctaBtn.id = "eventsCtaBtn";
    ctaBtn.className = "landing-btn mt-3";
    ctaBtn.target = "_blank";
    ctaBtn.rel = "noopener noreferrer";
    eventsSection.appendChild(ctaBtn);
  }

  if (eventsData.ctaEnabled && safeUrl(eventsData.ctaUrl)) {
    ctaBtn.style.display = "";
    ctaBtn.href = safeUrl(eventsData.ctaUrl);
    ctaBtn.textContent = eventsData.ctaText || "Ver más";
  } else {
    ctaBtn.style.display = "none";
  }
}

/* =========================================================
   TRAININGS & GAMES
========================================================= */

function renderTrainings(trainingsData = {}, socials = {}) {
  const trainingsSection = document.getElementById("entrenamientos");
  if (!trainingsSection) return;

  const blocks = Array.isArray(trainingsData.blocks) ? trainingsData.blocks : [];
  if (!blocks.length) {
    trainingsSection.style.display = "none";
    return;
  }

  trainingsSection.style.display = "";
  trainingsSection.querySelector("h2").textContent =
    trainingsData.title || "Entrenamientos y Juegos";

  const container = trainingsSection.querySelector(".landing-cards");
  container.innerHTML = "";

  blocks.forEach((block) => {
    const card = document.createElement("div");
    card.className = "landing-card";

    card.innerHTML = `<h3>${block.name || "—"}</h3>`;

    const schedule = Array.isArray(block.schedule) ? block.schedule : [];
    schedule.forEach((item) => {
      const p = document.createElement("p");
      p.textContent = `${item.day || "—"}: ${item.time || "—"}`;
      card.appendChild(p);
    });

    container.appendChild(card);
  });

  const trainingsWhatsappCta = document.getElementById("trainingsWhatsappCta");
  if (trainingsWhatsappCta) {
    const waUrl = safeUrl(socials.whatsappUrl || socials.whatsapp || "");
    if (waUrl) {
      trainingsWhatsappCta.style.display = "";
      trainingsWhatsappCta.textContent = socials.whatsappLabel || "WhatsApp";
      trainingsWhatsappCta.href = waUrl;
      trainingsWhatsappCta.target = "_blank";
      trainingsWhatsappCta.rel = "noopener noreferrer";
    } else {
      trainingsWhatsappCta.style.display = "none";
    }
  }
}

/* =========================================================
   HONORS
========================================================= */

function renderHonors(honorsData = {}) {
  const honorsSection = document.getElementById("honorsSection");
  if (!honorsSection) return;

  const items = Array.isArray(honorsData.items) ? honorsData.items : [];
  if (!items.length) {
    honorsSection.style.display = "none";
    return;
  }

  honorsSection.style.display = "";
  honorsSection.querySelector("h2").textContent = honorsData.title || "Palmarés";

  const container = honorsSection.querySelector(".landing-cards");
  container.innerHTML = "";

  items.forEach((item) => {
    let badge = "🏅";
    let className = "honor-card";

    const position = String(item.position || "").toLowerCase();

    if (position.includes("primer")) {
      badge = "🥇";
      className += " honor-gold";
    } else if (position.includes("segundo")) {
      badge = "🥈";
      className += " honor-silver";
    } else if (position.includes("tercer")) {
      badge = "🥉";
      className += " honor-bronze";
    } else if (position.includes("espíritu")) {
      badge = "🤝";
      className += " honor-spirit";
    }

    const card = document.createElement("div");
    card.className = className;

    card.innerHTML = `
      <div class="honor-badge">${badge}</div>
      <div class="honor-position">${item.position || "—"}</div>
      <div class="honor-tournament">${item.tournament || "—"}</div>
      <div class="honor-year">${item.year || "—"}</div>
    `;

    container.appendChild(card);
  });
}

/* =========================================================
   UNIFORMS
========================================================= */

function renderUniforms(uniformData = {}) {
  const uniformsSection = document.getElementById("uniformsSection");
  if (!uniformsSection) return;

  const items = Array.isArray(uniformData.items) ? uniformData.items : [];

  if (!items.length) {
    uniformsSection.style.display = "none";
    return;
  }

  uniformsSection.style.display = "";

  uniformsSection.querySelector("h2").textContent =
    uniformData.title || "Uniformes del Equipo";

  uniformsSection.querySelector("p").textContent =
    uniformData.subtitle || "Compra tu indumentaria oficial del club";

  const carouselInner = document.querySelector("#uniformsCarousel .carousel-inner");
  if (!carouselInner) return;

  carouselInner.innerHTML = "";

  const itemsPerSlide = window.innerWidth < 768 ? 1 : 3;

  for (let i = 0; i < items.length; i += itemsPerSlide) {
    const slideItems = items.slice(i, i + itemsPerSlide);

    const slide = document.createElement("div");
    slide.className = `carousel-item ${i === 0 ? "active" : ""}`;

    const row = document.createElement("div");
    row.className = "uniform-row";

    slideItems.forEach((item) => {
      const card = document.createElement("div");
      card.className = "uniform-card";

      card.innerHTML = `
        <div class="uniform-img-wrapper">
          <img src="${item.image}" alt="${item.name || "Uniforme"}" />
        </div>
        <div class="uniform-info">
          <h3>${item.name || "—"}</h3>
          <a
            class="landing-btn"
            href="${safeUrl(uniformData.orderUrl)}"
            target="_blank"
          >
            ${uniformData.ctaLabel || "Comprar"}
          </a>
        </div>
      `;

      row.appendChild(card);
    });

    slide.appendChild(row);
    carouselInner.appendChild(slide);
  }

  const carouselEl = document.getElementById("uniformsCarousel");
  if (carouselEl && window.bootstrap?.Carousel) {
    new bootstrap.Carousel(carouselEl);
  }
}

/* =========================================================
   HELPERS
========================================================= */

function safeUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

async function loadSocialLinks() {
  const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "social_links")).catch(() => null);
  return snap?.exists?.() ? (snap.data() || {}) : {};
}

async function loadHonorsData() {
  const snap = await getDoc(doc(db, "club_config", "honors")).catch(() => null);
  const data = snap?.exists?.() ? (snap.data() || {}) : {};

  return {
    title: data.title || "Palmarés",
    items: Array.isArray(data.items) ? data.items : [],
  };
}

async function loadUniformsData() {
  const snap = await getDoc(doc(db, "club_config", "uniforms")).catch(() => null);
  const data = snap?.exists?.() ? (snap.data() || {}) : {};

  return {
    title: data.title || "Uniformes del Equipo",
    subtitle: data.subtitle || "Compra tu indumentaria oficial del club",
    ctaLabel: data.ctaLabel || "Comprar",
    orderUrl: data.orderUrl || "",
    items: Array.isArray(data.items) ? data.items : [],
  };
}

async function loadTrainingsData() {
  const snap = await getDoc(doc(db, COL_CLUB_CONFIG, "trainings")).catch(() => null);
  const data = snap?.exists?.() ? (snap.data() || {}) : {};

  return {
    title: data.title || "Entrenamientos y Juegos",
    blocks: Array.isArray(data.blocks) ? data.blocks : [],
  };
}

/* =========================================================
   FOOTER
========================================================= */

function renderFooter() {
  const footer = document.querySelector(".landing-footer");
  if (!footer) return;

  footer.innerHTML = `
    <p>${CLUB_DATA.footer.copyright}</p>
    <p>Fundados en el ${CLUB_DATA.club.foundedYear}</p>
  `;
}

/* =========================================================
   BOOT
========================================================= */

async function bootNormalLanding() {
  await init();
  await loadIndexSettings();

 const [socials, heroData, eventsData, honorsData, uniformsData, trainingsData] = await Promise.all([
    loadSocialLinks(),
    loadHeroData(),
    loadEventsData(),
    loadHonorsData(),
    loadUniformsData(),
    loadTrainingsData(),
  ]);

  renderHero(heroData);
  renderSocials(socials);
  renderTrainings(trainingsData, socials);
  renderEvents(eventsData);
  renderHonors(honorsData);
  renderUniforms(uniformsData);
  renderFooter();
}

//start screen
if (isPendingView) {
  bootPendingMode();
} else {
  bootNormalLanding();
}