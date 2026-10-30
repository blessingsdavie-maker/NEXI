(() => {
  "use strict";

  const darkStartsAt = 18;
  const lightStartsAt = 6;
  let theme = getAutomaticTheme();
  let automaticTheme = theme;
  let manuallyOverridden = false;
  let transitionTimer;

  function getAutomaticTheme() {
    const hour = new Date().getHours();
    return hour >= darkStartsAt || hour < lightStartsAt ? "dark" : "light";
  }

  function getNextTransition() {
    const now = new Date();
    const next = new Date(now);
    const hour = now.getHours();

    if (hour < lightStartsAt) {
      next.setHours(lightStartsAt, 0, 0, 0);
    } else if (hour < darkStartsAt) {
      next.setHours(darkStartsAt, 0, 0, 0);
    } else {
      next.setDate(next.getDate() + 1);
      next.setHours(lightStartsAt, 0, 0, 0);
    }

    return next;
  }

  function applyTheme() {
    if (theme === "dark") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;

    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute("content", theme === "dark" ? "#111d17" : "#f3f5ef");

    document.querySelectorAll("#themeToggle, #portalTheme").forEach((button) => {
      button.setAttribute("aria-label", theme === "dark" ? "Use light theme" : "Use dark theme");
    });
  }

  function syncTheme() {
    const currentAutomaticTheme = getAutomaticTheme();
    if (currentAutomaticTheme !== automaticTheme) {
      automaticTheme = currentAutomaticTheme;
      manuallyOverridden = false;
    }
    if (!manuallyOverridden) theme = automaticTheme;

    applyTheme();
    window.clearTimeout(transitionTimer);
    transitionTimer = window.setTimeout(syncTheme, getNextTransition().getTime() - Date.now() + 100);
  }

  function attachThemeButtons() {
    document.querySelectorAll("#themeToggle, #portalTheme").forEach((button) => {
      button.addEventListener("click", () => {
        manuallyOverridden = true;
        theme = theme === "dark" ? "light" : "dark";
        applyTheme();
      });
    });
    applyTheme();
  }

  applyTheme();
  syncTheme();
  window.addEventListener("focus", syncTheme);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) syncTheme();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attachThemeButtons, { once: true });
  } else {
    attachThemeButtons();
  }
})();
