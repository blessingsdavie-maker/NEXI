(() => {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const navToggle = byId("navToggle");
  const primaryNav = byId("primaryNav");

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

  const backgroundVideo = document.querySelector(".landing-background-video");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobileViewport = window.matchMedia("(max-width: 700px)");
  const syncBackgroundVideo = () => {
    if (!backgroundVideo) return;
    const source = mobileViewport.matches
      ? backgroundVideo.dataset.mobileSrc
      : backgroundVideo.dataset.desktopSrc;

    if (source && backgroundVideo.getAttribute("src") !== source) {
      backgroundVideo.classList.add("is-loading");
      backgroundVideo.src = source;
      backgroundVideo.load();
    }

    if (reducedMotion.matches) {
      backgroundVideo.pause();
      return;
    }

    backgroundVideo.play().catch((error) => {
      console.error("NALSAFE background video could not start:", error);
    });
  };
  syncBackgroundVideo();
  mobileViewport.addEventListener("change", syncBackgroundVideo);
  reducedMotion.addEventListener("change", syncBackgroundVideo);
  backgroundVideo?.addEventListener("loadeddata", () => {
    backgroundVideo.classList.remove("is-loading");
  });
  backgroundVideo?.addEventListener("timeupdate", () => {
    if (!backgroundVideo.duration) return;
    if (backgroundVideo.currentTime >= backgroundVideo.duration - 0.7) {
      backgroundVideo.classList.add("is-loop-fade");
    } else if (backgroundVideo.currentTime < 0.45) {
      backgroundVideo.classList.remove("is-loop-fade");
    }
  });
  backgroundVideo?.addEventListener("error", () => {
    console.error("NALSAFE background video failed to load:", backgroundVideo.error);
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
    if (!results || !search) return;
    controller?.abort();
    controller = new AbortController();
    const parameters = new URLSearchParams({ search: search.value.trim() });
    if (activeCategory !== "all") parameters.set("category", activeCategory);
    results.setAttribute("aria-busy", "true");
    try {
      const response = await window.nalsafeApi.request(`/directory?${parameters}`, { signal: controller.signal });
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
