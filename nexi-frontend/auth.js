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

  const authModeButtons = [
    ...document.querySelectorAll("[data-auth-mode]")
  ];

  const query = new URLSearchParams(window.location.search);
  const inviteToken = query.get("invite") || "";

  let accountMode =
    ["register", "signup"].includes(query.get("mode")) || inviteToken
      ? "register"
      : "login";

  /*
   * Verify that the NALSAFE API helper has loaded.
   */
  if (!window.nalsafeApi) {
    console.error(
      "NALSAFE API is not available. Make sure nalsafe-api.js loads before auth.js."
    );
    return;
  }

  /*
   * IMPORTANT:
   * Do not clear the authentication token here.
   * Clearing it whenever this page loads can interfere
   * with the existing login session.
   */

  const showMessage = (text, isError = false) => {
    if (!message) return;

    message.textContent = text;
    message.classList.toggle("is-error", isError);
  };

  /*
   * Switch between Login and Create Account.
   */
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

    if (accountPassword) {
      accountPassword.autocomplete = registering
        ? "new-password"
        : "current-password";

      accountPassword.minLength = registering ? 8 : 1;
    }

    const authTitle = get("authTitle");
    const authDescription = get("authDescription");
    const passwordLabel = get("accountPasswordLabel");

    if (authTitle) {
      authTitle.textContent = registering
        ? "Create your NALSAFE account"
        : "Sign in or create an account";
    }

    if (authDescription) {
      authDescription.textContent = registering
        ? "Create an account to keep your profile available across devices."
        : "Sign in with your email, or choose Create account to register.";
    }

    if (passwordLabel) {
      passwordLabel.textContent = registering
        ? "Create a password"
        : "Password";
    }

    if (accountSubmit) {
      accountSubmit.innerHTML =
        `${registering ? "Create account" : "Sign in"} ` +
        `<span aria-hidden="true">→</span>`;
    }

    authModeButtons.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.authMode === mode)
      );
    });

    /*
     * Clear password fields when switching modes.
     */
    if (accountPassword) {
      accountPassword.value = "";
    }

    if (accountConfirm) {
      accountConfirm.value = "";
    }

    if (accountName && registering) {
      accountName.value = "";
    }

    showMessage("");
  };

  /*
   * Login / Create Account buttons.
   */
  authModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.authMode;

      if (!["login", "register"].includes(mode)) {
        return;
      }

      setMode(mode);
    });
  });

  /*
   * Form submission.
   */
  if (accountForm) {
    accountForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const email = accountEmail
        ? accountEmail.value.trim().toLowerCase()
        : "";

      const password = accountPassword
        ? accountPassword.value
        : "";

      const registering = accountMode === "register";

      /*
       * Validate registration fields.
       */
      if (registering) {
        const fullName = accountName
          ? accountName.value.trim()
          : "";

        const confirmPassword = accountConfirm
          ? accountConfirm.value
          : "";

        if (!fullName) {
          showMessage("Please enter your full name.", true);
          return;
        }

        if (!email) {
          showMessage("Please enter your email address.", true);
          return;
        }

        if (!password || password.length < 8) {
          showMessage(
            "Your password must be at least 8 characters.",
            true
          );
          return;
        }

        if (password !== confirmPassword) {
          showMessage("Those passwords don't match yet.", true);
          return;
        }
      }

      /*
       * Validate login fields.
       */
      if (!registering) {
        if (!email) {
          showMessage("Please enter your email address.", true);
          return;
        }

        if (!password) {
          showMessage("Please enter your password.", true);
          return;
        }
      }

      if (accountSubmit) {
        accountSubmit.disabled = true;
      }

      showMessage(
        registering ? "Creating your account…" : "Signing in…"
      );

      try {
        const endpoint = registering ? "/signup" : "/login";

        const body = registering
          ? {
              full_name: accountName
                ? accountName.value.trim()
                : "",
              email,
              password,
              invite_token: inviteToken || undefined
            }
          : {
              email,
              password
            };

        const response = await window.nalsafeApi.request(
          endpoint,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          }
        );

        const data = await response.json().catch(() => ({}));

        /*
         * Handle API errors.
         */
        if (!response.ok) {
          showMessage(
            data.message || "Your request could not be completed.",
            true
          );
          return;
        }

        /*
         * Confirm that the backend returned a user.
         */
        if (!data.user || !data.user.role) {
          console.error(
            "The backend response did not include a valid user role.",
            data
          );

          showMessage(
            "Your account response is missing role information. Please check the backend.",
            true
          );
          return;
        }

        /*
         * Save the JWT if the backend returns one.
         * Do not reject cookie-based sessions solely because
         * the backend does not return a JWT in the response.
         */
        if (data.token) {
          window.nalsafeApi.setToken(data.token);
        }

        /*
         * Redirect according to the account role.
         */
        const role = data.user.role;

        if (role === "admin" || role === "support_admin") {
          window.location.replace("admin-dashboard.html");
        } else if (role === "user") {
          window.location.replace("user-dashboard.html");
        } else {
          console.error("Unexpected account role:", role);

          showMessage(
            "Your account role is not recognized. Please contact support.",
            true
          );
        }
      } catch (error) {
        console.error("NALSAFE authentication error:", error);

        showMessage(
          "Could not connect to the account service. Please try again.",
          true
        );
      } finally {
        if (accountSubmit) {
          accountSubmit.disabled = false;
        }
      }
    });
  }

  /*
   * Update the footer year.
   */
  const authYear = get("authYear");

  if (authYear) {
    authYear.textContent = String(new Date().getFullYear());
  }

  /*
   * Initialize the page.
   */
  setMode(accountMode);

})();