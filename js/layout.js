document.addEventListener("click", (e) => {
  const menuBtn = document.getElementById("menuBtn");
  const mobileMenu = document.getElementById("mobileMenu");

  if (!menuBtn || !mobileMenu) return;

  if (e.target === menuBtn) {
    mobileMenu.classList.toggle("open");
  }
});
