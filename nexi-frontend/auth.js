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

  let accountMode =
    query.get("mode") === "register" || inviteToken
      ? "register"
      : "login";

  if (
    !accountForm ||
    !message ||
    !accountEmail ||
    !accountPassword ||
    !accountSubmit ||
    !window.nexiApi
  ) {
    console.error(
      "Nexi authentication could not start: required elements or nexiApi are missing."
    );
    return;
  }

  const showMessage = (text, isError = false) => {
    message.textContent = text;
    message.classList.toggle("is-error", isError);
  };

  const setMode = (mode) => {
    accountMode = mode;

    const registering = mode === "register";

    if (accountNameField) {
      accountNameField.hidden = !registering;
    }

    if (accountConfirmField) {
      accountConfirmField.hidden = !registering;
    }

    if (accountName) {
      accountName.required = registering;
    }

    if (accountConfirm) {
      accountConfirm.required = registering;
    }

    accountPassword.autocomplete = registering
      ? "new-password"
      : "current-password";

    accountPassword.minLength = registering ? 8 : 1;

    const title = get("authTitle");
    const description = get("authDescription");
    const passwordLabel = get("accountPasswordLabel");

    if (title) {
      title.textContent = registering
        ? "Create your Nexi account"
        : "Sign in or create an account";
    }

    if (description) {
      description.textContent = registering
        ? "Create an account to keep your profile available across devices."
        : "Sign in with your email, or choose Create account to register.";
    }

    if (passwordLabel) {
      passwordLabel.textContent = registering
        ? "Create a password"
        : "Password";
    }

    accountSubmit.innerHTML =
      `${registering ? "Create account" : "Sign in"} ` +
      `<span aria-hidden="true">→</span>`;

    authModeButtons.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.authMode === mode)
      );
    });

    if (accountName) {
      accountName.value = "";
    }

    accountPassword.value = "";

    if (accountConfirm) {
      accountConfirm.value = "";
    }

    showMessage("");
  };

  authModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setMode(button.dataset.authMode);
    });
  });

  accountForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = accountEmail.value.trim().toLowerCase();
    const password = accountPassword.value;
    const registering = accountMode === "register";

    if (registering && accountName && !accountName.value.trim()) {
      showMessage("Please enter your full name.", true);
      return;
    }

    if (
      registering &&
      accountConfirm &&
      password !== accountConfirm.value
    ) {
      showMessage("Those passwords don't match yet.", true);
      return;
    }

    accountSubmit.disabled = true;

    showMessage(
      registering
        ? "Creating your account…"
        : "Signing in…"
    );

    try {
      const response = await window.nexiApi.request(
        registering ? "/signup" : "/login",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(
            registering
              ? {
                  full_name: accountName
                    ? accountName.value.trim()
                    : "",
                  email,
                  password,
                  invite_token:
                    inviteToken || undefined
                }
              : {
                  email,
                  password
                }
          )
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        showMessage(
          data.message ||
            "Your request could not be completed.",
          true
        );
        return;
      }

      /*
       * IMPORTANT:
       * The Nexi backend returns a JWT token after
       * successful signup/login.
       */
      if (!data.token) {
        console.error(
          "Authentication response did not contain a token.",
          data
        );

        showMessage(
          "The account was created, but the login session was not returned.",
          true
        );

        return;
      }

      // Save authentication session
      window.nexiApi.setToken(data.token);

      const destination =
        data.user?.role === "admin"
          ? "admin-dashboard.html"
          : "user-dashboard.html";

      window.location.replace(destination);

    } catch (error) {
      console.error(
        "Nexi authentication error:",
        error
      );

      showMessage(
        "Could not connect to the account service. Please try again.",
        true
      );

    } finally {
      accountSubmit.disabled = false;
    }
  });

  const year = get("authYear");

  if (year) {
    year.textContent =
      String(new Date().getFullYear());
  }

  setMode(accountMode);

  /*
   * If already authenticated, go directly
   * to the appropriate dashboard.
   */
  window.nexiApi
    .request("/me")
    .then(async (response) => {
      if (!response.ok) return;

      const data = await response.json();

      if (data.user) {
        window.location.replace(
          data.user.role === "admin"
            ? "admin-dashboard.html"
            : "user-dashboard.html"
        );
      }
    })
    .catch(() => {});
})();