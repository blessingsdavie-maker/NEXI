(() => {
  "use strict";

  const storageKey = "nexi-demo-state";
  const initialState = {
    checkin: null,
    theme: null
  };

  const loadState = () => {
    try {
      return { ...initialState, ...JSON.parse(localStorage.getItem(storageKey) || "{}") };
    } catch {
      return { ...initialState };
    }
  };

  let state = loadState();

  const saveState = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // The prototype remains usable even if browser storage is unavailable.
    }
  };

  const byId = (id) => document.getElementById(id);
  const dashboardDialog = byId("dashboardDialog");
  const supportDialog = byId("supportDialog");
  const navToggle = byId("navToggle");
  const primaryNav = byId("primaryNav");
  const themeToggle = byId("themeToggle");
  const heroBackgroundVideo = document.querySelector(".hero-background-video");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobileHero = window.matchMedia("(max-width: 700px)");

  const syncHeroVideoSource = () => {
    if (!heroBackgroundVideo) return;
    const source = mobileHero.matches
      ? heroBackgroundVideo.dataset.mobileSrc
      : heroBackgroundVideo.dataset.desktopSrc;
    if (!source || heroBackgroundVideo.getAttribute("src") === source) return;
    heroBackgroundVideo.src = source;
    heroBackgroundVideo.load();
  };

  syncHeroVideoSource();

  heroBackgroundVideo?.addEventListener("timeupdate", () => {
    if (mobileHero.matches && heroBackgroundVideo.currentTime >= 8) {
      heroBackgroundVideo.currentTime = 0;
    }
  });

  const syncHeroVideoPlayback = () => {
    if (!heroBackgroundVideo) return;
    if (reducedMotion.matches) {
      heroBackgroundVideo.pause();
      return;
    }
    heroBackgroundVideo.play().catch(() => {
      // The gradient backdrop remains visible if autoplay is unavailable.
    });
  };

  syncHeroVideoPlayback();
  mobileHero.addEventListener("change", () => {
    syncHeroVideoSource();
    syncHeroVideoPlayback();
  });
  reducedMotion.addEventListener("change", syncHeroVideoPlayback);

  const setTheme = (theme) => {
    if (theme) {
      document.documentElement.dataset.theme = theme;
      themeToggle.setAttribute("aria-label", theme === "dark" ? "Use light theme" : "Use dark theme");
    } else {
      delete document.documentElement.dataset.theme;
      themeToggle.setAttribute("aria-label", "Use dark theme");
    }
  };

  setTheme(state.theme);

  themeToggle.addEventListener("click", () => {
    const isDark = document.documentElement.dataset.theme === "dark";
    state.theme = isDark ? "light" : "dark";
    saveState();
    setTheme(state.theme);
  });

  navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!isOpen));
    primaryNav.classList.toggle("is-open", !isOpen);
  });

  primaryNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navToggle.setAttribute("aria-expanded", "false");
      primaryNav.classList.remove("is-open");
    });
  });

  window.addEventListener("scroll", () => {
    document.querySelector(".site-header").classList.toggle("is-scrolled", window.scrollY > 8);
  }, { passive: true });

  const memberData = [
    { name: "Mom", initial: "M", colour: "a-one", time: "Checked in at 6:42 PM", status: "Safe", statusClass: "" },
    { name: "Dad", initial: "D", colour: "a-two", time: "Checked in at 6:51 PM", status: "Safe", statusClass: "" },
    { name: "Brianna", initial: "B", colour: "a-three", time: "Checked in at 6:57 PM", status: "Safe", statusClass: "" },
    { name: "James", initial: "J", colour: "a-four", time: "Checked in at 6:59 PM", status: "Safe", statusClass: "" },
    { name: "You", initial: "A", colour: "a-four", time: "Waiting for your update", status: "Pending", statusClass: "pending", isSelf: true }
  ];

  const renderMembers = () => {
    const container = byId("dashboardMembers");
    if (!container) return;
    const checkedIn = state.checkin && state.checkin.kind;
    const self = memberData.find((member) => member.isSelf);
    const members = memberData.map((member) => {
      const current = member.isSelf && checkedIn
        ? {
            ...member,
            time: state.checkin.kind === "safe" ? "Checked in just now" : "Support update selected",
            status: state.checkin.kind === "safe" ? "Safe" : "Support requested",
            statusClass: state.checkin.kind === "safe" ? "" : "pending"
          }
        : member;
      return `<div class="dashboard-member"><div class="dashboard-member-info"><span class="avatar ${current.colour}">${current.initial}</span><span><b>${current.name}</b><small>${current.time}</small></span></div><span class="member-status ${current.statusClass}">${current.status}</span></div>`;
    });
    container.innerHTML = members.join("");
  };

  const renderCheckin = () => {
    const demoStatus = byId("demoStatus");
    const demoActions = byId("demoActions");
    const demoReset = byId("demoReset");
    const dashboardText = byId("dashboardCheckinText");
    const dashboardActions = byId("dashboardActions");
    const dashboardReset = byId("dashboardReset");
    const dashboardCircleSummary = byId("dashboardCircleSummary");
    const checkin = state.checkin;

    if (!checkin) {
      demoStatus.textContent = "Your family gets a gentle update, not your every move.";
      demoActions.hidden = false;
      demoReset.hidden = true;
      dashboardText.textContent = "Your circle is waiting for a quick update.";
      dashboardActions.hidden = false;
      dashboardReset.hidden = true;
      dashboardCircleSummary.textContent = "4 of 5 checked in";
    } else if (checkin.kind === "safe") {
      demoStatus.textContent = "You’re checked in safe. Your circle can breathe easier.";
      demoActions.hidden = true;
      demoReset.hidden = false;
      dashboardText.textContent = "You checked in safe. Your circle has been updated.";
      dashboardActions.hidden = true;
      dashboardReset.hidden = false;
      dashboardCircleSummary.textContent = "All 5 checked in safe";
    } else {
      demoStatus.textContent = "A private support update is ready for the people you choose.";
      demoActions.hidden = true;
      demoReset.hidden = false;
      dashboardText.textContent = "Your support update is ready. This prototype has not alerted anyone.";
      dashboardActions.hidden = true;
      dashboardReset.hidden = false;
      dashboardCircleSummary.textContent = "Your support update is ready";
    }
    renderMembers();
  };

  const selectCheckin = (kind) => {
    if (kind === "help") {
      supportDialog.showModal();
      return;
    }
    state.checkin = { kind: "safe", at: new Date().toISOString() };
    saveState();
    renderCheckin();
  };

  document.querySelectorAll("[data-demo-checkin]").forEach((button) => {
    button.addEventListener("click", () => selectCheckin(button.dataset.demoCheckin));
  });
  document.querySelectorAll("[data-dashboard-checkin]").forEach((button) => {
    button.addEventListener("click", () => selectCheckin(button.dataset.dashboardCheckin));
  });

  const resetCheckin = () => {
    state.checkin = null;
    saveState();
    renderCheckin();
  };
  byId("demoReset").addEventListener("click", resetCheckin);
  byId("dashboardReset").addEventListener("click", resetCheckin);

  byId("confirmSupport").addEventListener("click", () => {
    state.checkin = { kind: "help", at: new Date().toISOString() };
    saveState();
    supportDialog.close();
    renderCheckin();
    if (dashboardDialog.open) byId("dashboardCheckinText").focus();
  });

  document.querySelectorAll("[data-open-dashboard]").forEach((button) => {
    button.addEventListener("click", () => {
      renderCheckin();
      dashboardDialog.showModal();
    });
  });
  document.querySelectorAll("[data-close-dashboard]").forEach((button) => button.addEventListener("click", () => dashboardDialog.close()));
  document.querySelectorAll("[data-close-support]").forEach((button) => button.addEventListener("click", () => supportDialog.close()));

  [dashboardDialog, supportDialog].forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });

  const services = [
    { category: "health", icon: "✚", label: "Health", name: "Nearest hospital", detail: "Keep care options close at hand", phone: "Not connected in demo" },
    { category: "safety", icon: "⌁", label: "Safety", name: "Local safety support", detail: "Verified local help, when available", phone: "Not connected in demo" },
    { category: "support", icon: "♡", label: "Support", name: "Someone to talk to", detail: "Save trusted support services", phone: "Not connected in demo" }
  ];
  const results = byId("serviceResults");
  const search = byId("serviceSearch");
  let activeCategory = "all";

  const renderServices = () => {
    const query = search.value.trim().toLowerCase();
    const filtered = services.filter((service) => {
      const categoryMatches = activeCategory === "all" || service.category === activeCategory;
      const queryMatches = [service.label, service.name, service.detail].join(" ").toLowerCase().includes(query);
      return categoryMatches && queryMatches;
    });
    if (!filtered.length) {
      results.innerHTML = '<p class="empty-results">No sample service matches that search.<br>Try another term or category.</p>';
      return;
    }
    results.innerHTML = filtered.map((service) => `<article class="service-card ${service.category}"><span class="service-symbol" aria-hidden="true">${service.icon}</span><div class="service-info"><p class="service-category">${service.label}</p><h3>${service.name}</h3><p>${service.detail}</p><a href="#waitlist">${service.phone} <span aria-hidden="true">→</span></a></div></article>`).join("");
  };
  search.addEventListener("input", renderServices);
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category;
      document.querySelectorAll("[data-category]").forEach((chip) => chip.classList.toggle("is-active", chip === button));
      renderServices();
    });
  });
  renderServices();

  byId("year").textContent = new Date().getFullYear();
  renderCheckin();
})();
