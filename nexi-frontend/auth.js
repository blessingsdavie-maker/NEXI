(() => {
  "use strict";

  const get = (id) => document.getElementById(id);
  const accountForm = get("accountForm");
  const message = get("authMessage");
  const accountEmail = get("accountEmail");
  const accountName = get("accountName");
  const accountPassword = get("accountPassword");
  const accountConfirm = get("accountConfirm");
  const accountNameField = get("accountNameField");
  const accountConfirmField = get("accountConfirmField");
  const accountSubmit = get("accountSubmit");
  const authModeButtons = [...document.querySelectorAll("[data-auth-mode]")];
  const query = new URLSearchParams(window.location.search);
  const inviteToken = query.get("invite") || "";
  let accountMode = query.get("mode") === "register" || inviteToken ? "register" : "login";

  const showMessage = (text, isError = false) => {
    message.textContent = text;
    message.classList.toggle("is-error", isError);
  };

  const setMode = (mode) => {
    accountMode = mode;
    const registering = mode === "register";
    accountNameField.hidden = !registering;
    accountConfirmField.hidden = !registering;
    accountName.required = registering;
    accountConfirm.required = registering;
    accountPassword.autocomplete = registering ? "new-password" : "current-password";
    accountPassword.minLength = registering ? 8 : 1;
    get("authTitle").textContent = registering ? "Create your Nexi account" : "Sign in or create an account";
    get("authDescription").textContent = registering
      ? "Create an account to keep your profile available across devices."
      : "Sign in with your email, or choose Create account to register.";
    get("accountPasswordLabel").textContent = registering ? "Create a password" : "Password";
    accountSubmit.innerHTML = `${registering ? "Create account" : "Sign in"} <span aria-hidden="true">→</span>`;
    authModeButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.authMode === mode)));
    accountName.value = "";
    accountPassword.value = "";
    accountConfirm.value = "";
    showMessage("");
  };

  authModeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.authMode)));

  accountForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = accountEmail.value.trim().toLowerCase();
    const password = accountPassword.value;
    const registering = accountMode === "register";

    if (registering && password !== accountConfirm.value) {
      showMessage("Those passwords don't match yet.", true);
      return;
    }

    accountSubmit.disabled = true;
    showMessage(registering ? "Creating your account…" : "Signing in…");

    try {
      const response = await window.nexiApi.request(registering ? "/signup" : "/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registering
          ? { full_name: accountName.value.trim(), email, password, invite_token: inviteToken || undefined }
          : { email, password })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
  showMessage(data.message || "Your request could not be completed.", true);
  return;
}

// Save the JWT returned by the backend
if (!data.token) {
  showMessage("Account created, but the login session could not be established.", true);
  return;
}

window.nexiApi.setToken(data.token);

window.location.assign(
  data.user?.role === "admin"
    ? "admin-dashboard.html"
    : "user-dashboard.html"
);

  get("authYear").textContent = String(new Date().getFullYear());
  setMode(accountMode);

  window.nexiApi.request("/me").then(async (response) => {
    if (!response.ok) return;
    const data = await response.json();
    window.location.replace(data.user?.role === "admin" ? "admin-dashboard.html" : "user-dashboard.html");
  }).catch(() => {});
})();