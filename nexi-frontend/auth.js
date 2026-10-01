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
    query.get("mode") === "register" || inviteToken
      ? "register"
      : "login";

  /*
   * Make sure the API helper has loaded before
   * attempting to use authentication.
   */
  if (!window.nexiApi) {
    console.error(
      "Nexi API is not available. Make sure nexi-api.js loads before auth.js."
    );
    return;
  }

  window.nexiApi.clearToken();

  const showMessage = (text, isError = false) => {
    if (!message) {
      return;
    }

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
        ? "Create your Nexi account"
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
     * Clear password fields when switching between
     * Login and Create Account modes.
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
   * Login / Create Account mode buttons
   */
  authModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.authMode;

      /*
       * When explicitly switching into registration mode,
       * clear any existing authentication session.
       */
      if (mode === "register") {
        window.nexiApi.clearToken();
      }

      setMode(mode);
    });
  });

  /*
   * Form submission
   */
  if (accountForm) {
    accountForm.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const email = accountEmail
          ? accountEmail.value.trim().toLowerCase()
          : "";

        const password = accountPassword
          ? accountPassword.value
          : "";

        const registering =
          accountMode === "register";

        /*
         * Registration validation
         */
        if (registering) {
          const fullName = accountName
            ? accountName.value.trim()
            : "";

          const confirmPassword = accountConfirm
            ? accountConfirm.value
            : "";

          if (!fullName) {
            showMessage(
              "Please enter your full name.",
              true
            );
            return;
          }

          if (!email) {
            showMessage(
              "Please enter your email address.",
              true
            );
            return;
          }

          if (!password) {
            showMessage(
              "Please create a password.",
              true
            );
            return;
          }

          if (password.length < 8) {
            showMessage(
              "Your password must be at least 8 characters.",
              true
            );
            return;
          }

          if (password !== confirmPassword) {
            showMessage(
              "Those passwords don't match yet.",
              true
            );
            return;
          }
        }

        /*
         * Login validation
         */
        if (!registering) {
          if (!email) {
            showMessage(
              "Please enter your email address.",
              true
            );
            return;
          }

          if (!password) {
            showMessage(
              "Please enter your password.",
              true
            );
            return;
          }
        }

        if (accountSubmit) {
          accountSubmit.disabled = true;
        }

        showMessage(
          registering
            ? "Creating your account…"
            : "Signing in…"
        );

        try {
          const endpoint = registering
            ? "/signup"
            : "/login";

          const body = registering
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
              };

          const response =
            await window.nexiApi.request(
              endpoint,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
              }
            );

          const data =
            await response
              .json()
              .catch(() => ({}));

          /*
           * Backend returned an error
           */
          if (!response.ok) {
            showMessage(
              data.message ||
                "Your request could not be completed.",
              true
            );
            return;
          }

          /*
           * Successful authentication must return
           * a JWT token.
           */
          if (!data.token) {
            console.error(
              "No authentication token returned by backend.",
              data
            );

            showMessage(
              registering
                ? "Your account was created, but the login session could not be established."
                : "You were authenticated, but the login session could not be established.",
              true
            );

            return;
          }

          /*
           * SAVE THE JWT
           *
           * This is what allows /me and other protected
           * endpoints to recognize the user after redirect.
           */
          window.nexiApi.setToken(
            data.token
          );

          /*
           * Determine which dashboard to open.
           */
          const destination =
            data.user &&
            data.user.role === "admin"
              ? "admin-dashboard.html"
              : "user-dashboard.html";

          /*
           * Use replace so the authentication page
           * does not remain in browser history.
           */
          window.location.replace(
            destination
          );

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
          if (accountSubmit) {
            accountSubmit.disabled = false;
          }
        }
      }
    );
  }

  /*
   * Current year in footer
   */
  const authYear = get("authYear");

  if (authYear) {
    authYear.textContent =
      String(new Date().getFullYear());
  }

  /*
   * Set initial mode
   */
  setMode(accountMode);

})();