(() => {
  "use strict";

  const accountsKey = "nexi-demo-accounts";
  const sessionKey = "nexi-user-session";
  const get = (id) => document.getElementById(id);
  const accountForm = get("accountForm");
  const message = get("authMessage");
  const accountEmail = get("accountEmail");
  const accountName = get("accountName");
  const accountPassword = get("accountPassword");
  const accountConfirm = get("accountConfirm");
  const accountNameField = get("accountNameField");
  const accountPasswordField = get("accountPasswordField");
  const accountConfirmField = get("accountConfirmField");
  const accountSubmit = get("accountSubmit");
  const changeEmail = get("changeEmail");
  const authHeading = document.querySelector(".auth-heading");
  let accountMode = "email";
  let currentAccount = null;

  const animateAccountStep = () => {
    [authHeading, accountForm, changeEmail].forEach((element) => {
      if (element.hidden) return;
      element.classList.remove("auth-step-entering");
      void element.offsetWidth;
      element.classList.add("auth-step-entering");
      element.addEventListener("animationend", () => element.classList.remove("auth-step-entering"), { once: true });
    });
  };

  const readAccounts = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(accountsKey) || "{}");
      return stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    } catch {
      return {};
    }
  };

  const showMessage = (text, isError = false) => {
    message.textContent = text;
    message.classList.toggle("is-error", isError);
  };

  const resetAccountForm = () => {
    accountMode = "email";
    currentAccount = null;
    accountEmail.readOnly = false;
    accountNameField.hidden = true;
    accountPasswordField.hidden = true;
    accountConfirmField.hidden = true;
    accountName.required = false;
    accountPassword.required = false;
    accountConfirm.required = false;
    accountName.value = "";
    accountPassword.value = "";
    accountConfirm.value = "";
    accountPassword.autocomplete = "current-password";
    get("authTitle").textContent = "Sign in or create an account";
    get("authDescription").textContent = "Start with your email. We’ll find your account or help you set one up.";
    accountSubmit.innerHTML = 'Continue with email <span aria-hidden="true">→</span>';
    changeEmail.hidden = true;
    showMessage("");
  };

  const existingSession = sessionStorage.getItem(sessionKey);
  if (existingSession) {
    window.location.replace("user-dashboard.html");
    return;
  }

  const toHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const fromHex = (value) => new Uint8Array(value.match(/.{2}/g).map((part) => Number.parseInt(part, 16)));
  const derivePassword = async (password, salt) => {
    if (!window.crypto?.subtle || !window.crypto?.getRandomValues) {
      throw new Error("Browser cryptography is unavailable. Open this prototype on localhost or HTTPS.");
    }
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const result = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: fromHex(salt), iterations: 120000, hash: "SHA-256" }, key, 256);
    return toHex(new Uint8Array(result));
  };

  const startSession = (account) => {
    sessionStorage.setItem(sessionKey, JSON.stringify({ email: account.email, name: account.name }));
    window.location.assign("user-dashboard.html");
  };

  const showAccountStep = (account, email) => {
    currentAccount = account;
    accountEmail.value = email;
    accountEmail.readOnly = true;
    accountPasswordField.hidden = false;
    accountPassword.required = true;
    changeEmail.hidden = false;
    if (account) {
      accountMode = "login";
      accountConfirmField.hidden = true;
      accountNameField.hidden = true;
      get("authTitle").textContent = "Welcome back";
      get("authDescription").textContent = `Sign in to continue as ${email}.`;
      get("accountPasswordLabel").textContent = "Password";
      accountPassword.autocomplete = "current-password";
      accountSubmit.innerHTML = 'Sign in <span aria-hidden="true">→</span>';
      showMessage("We found your demo account.");
    } else {
      accountMode = "register";
      accountNameField.hidden = false;
      accountConfirmField.hidden = false;
      accountName.required = true;
      accountConfirm.required = true;
      get("authTitle").textContent = "Create your Nexi account";
      get("authDescription").textContent = "Add your name and choose a password to continue.";
      get("accountPasswordLabel").textContent = "Create a password";
      accountPassword.autocomplete = "new-password";
      accountSubmit.innerHTML = 'Create account <span aria-hidden="true">→</span>';
      showMessage("No account found for this email. Create one below.");
    }
    animateAccountStep();
  };

  accountForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = accountEmail.value.trim().toLowerCase();
    if (accountMode === "email") {
      if (!accountEmail.validity.valid) {
        accountEmail.reportValidity();
        return;
      }
      showAccountStep(readAccounts()[email] || null, email);
      return;
    }

    showMessage(accountMode === "login" ? "Checking your demo account…" : "Creating your local demo account…");
    const password = accountPassword.value;
    if (accountMode === "register") {
      const name = accountName.value.trim();
      if (password.length < 8) {
        showMessage("Choose a password with at least 8 characters.", true);
        return;
      }
      if (password !== accountConfirm.value) {
        showMessage("Those passwords don't match yet.", true);
        return;
      }
      const accounts = readAccounts();
      if (accounts[email]) {
        showMessage("An account with that email already exists. Use a different email or go back and sign in.", true);
        return;
      }
      try {
        const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
        const account = { name, email, salt, passwordHash: await derivePassword(password, salt), createdAt: new Date().toISOString() };
        accounts[email] = account;
        localStorage.setItem(accountsKey, JSON.stringify(accounts));
        startSession(account);
      } catch (error) {
        showMessage(error.message || "Your demo account could not be created.", true);
      }
      return;
    }

    const account = currentAccount;
    if (!account) {
      showMessage("This demo account was not found. Use a different email to create an account.", true);
      return;
    }
    try {
      const passwordHash = await derivePassword(password, account.salt);
      if (passwordHash !== account.passwordHash) {
        showMessage("Email or password doesn't match this demo account.", true);
        return;
      }
      startSession(account);
    } catch (error) {
      showMessage(error.message || "Sign in could not be completed.", true);
    }
  });

  changeEmail.addEventListener("click", resetAccountForm);

  get("authYear").textContent = String(new Date().getFullYear());
  resetAccountForm();
})();