(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const storageKey = "nexi-theme";
  const themeToggle = byId("themeToggle");
  const navToggle = byId("navToggle");
  const primaryNav = byId("primaryNav");
  const getDefaultTheme = () => {
    const hour = new Date().getHours();
    return hour >= 18 || hour < 6 ? "dark" : "light";
  };
  let theme = localStorage.getItem(storageKey) || getDefaultTheme();
  if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, theme);
  const setTheme = () => {
    if (theme === "dark") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    themeToggle?.setAttribute("aria-label", theme === "dark" ? "Use light theme" : "Use dark theme");
  };
  setTheme();
  themeToggle?.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem(storageKey, theme);
    setTheme();
  });

  navToggle?.addEventListener("click", () => {
    const open = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!open));
    primaryNav?.classList.toggle("is-open", !open);
  });
  primaryNav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
    navToggle?.setAttribute("aria-expanded", "false");
    primaryNav.classList.remove("is-open");
  }));
  window.addEventListener("scroll", () => {
    document.querySelector(".site-header")?.classList.toggle("is-scrolled", window.scrollY > 8);
  }, { passive: true });

  const heroVideo = document.querySelector(".hero-background-video");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobileHero = window.matchMedia("(max-width: 700px)");
  const syncHero = () => {
    if (!heroVideo) return;
    const source = mobileHero.matches ? heroVideo.dataset.mobileSrc : heroVideo.dataset.desktopSrc;
    if (source && heroVideo.getAttribute("src") !== source) {
      heroVideo.src = source;
      heroVideo.load();
    }
    if (reducedMotion.matches) heroVideo.pause();
    else heroVideo.play().catch(() => {});
  };
  syncHero();
  mobileHero.addEventListener("change", syncHero);
  reducedMotion.addEventListener("change", syncHero);
  heroVideo?.addEventListener("timeupdate", () => {
    if (mobileHero.matches && heroVideo.currentTime >= 8) heroVideo.currentTime = 0;
  });

  const results = byId("serviceResults");
  const search = byId("serviceSearch");
  let activeCategory = "all";
  let controller;
  let searchTimer;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const renderServices = async () => {
    controller?.abort();
    controller = new AbortController();
    const parameters = new URLSearchParams({ search: search.value.trim() });
    if (activeCategory !== "all") parameters.set("category", activeCategory);
    results.setAttribute("aria-busy", "true");
    try {
      const response = await window.nexiApi.request(`/directory?${parameters}`, { signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "The service directory is unavailable.");
      if (!data.listings.length) {
        results.innerHTML = '<p class="empty-results">No verified services match this search.</p>';
        return;
      }
      results.innerHTML = data.listings.map((listing) => `<article class="service-card ${escapeHtml(listing.category.toLowerCase())}"><span class="service-symbol" aria-hidden="true">✚</span><div class="service-info"><p class="service-category">${escapeHtml(listing.category)}</p><h3>${escapeHtml(listing.name)}</h3><p>${escapeHtml(listing.area)}</p>${listing.contact ? `<p>${escapeHtml(listing.contact)}</p>` : ""}<span class="status-pill">Verified</span></div></article>`).join("");
    } catch (error) {
      if (error.name !== "AbortError") results.innerHTML = '<p class="empty-results">The service directory is temporarily unavailable.</p>';
    } finally {
      results.removeAttribute("aria-busy");
    }
  };
  search?.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(renderServices, 180);
  });
  document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
    activeCategory = button.dataset.category;
    document.querySelectorAll("[data-category]").forEach((chip) => {
      const active = chip === button;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", String(active));
    });
    renderServices();
  }));
  renderServices();
  const year = byId("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
