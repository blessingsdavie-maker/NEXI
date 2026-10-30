(() => {
  "use strict";

  const get = (id) => document.getElementById(id);

  const accountForm = get("accountForm");
  const forgotPasswordForm = get("forgotPasswordForm");
  const resetPasswordForm = get("resetPasswordForm");
  const message = get("authMessage");
  const accountEmail = get("accountEmail");
  const accountName = get("accountName");
  const accountPassword = get("accountPassword");
  const accountConfirm = get("accountConfirm");
  const accountNameField = get("accountNameField");
  const accountConfirmField = get("accountConfirmField");
  const accountSubmit = get("accountSubmit");
  const forgotPasswordRow = get("forgotPasswordRow");
  const authModeSwitch = document.querySelector(".auth-mode-switch");
  const authBottomAction = document.querySelector(".auth-bottom-action");

  const authModeButtons = [
    ...document.querySelectorAll("[data-auth-mode]")
  ];

  const query = new URLSearchParams(window.location.search);
  const inviteToken = query.get("invite") || "";
  const resetToken = query.get("reset") || "";
  if (resetToken) {
    window.history.replaceState({}, "", window.location.pathname);
  }

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

  const setRecoveryView = (view) => {
    const isAccount = view === "account";
    const isForgot = view === "forgot";
    const isReset = view === "reset";

    accountForm.hidden = !isAccount;
    forgotPasswordForm.hidden = !isForgot;
    resetPasswordForm.hidden = !isReset;
    authModeSwitch.hidden = !isAccount;
    authBottomAction.hidden = !isAccount;

    const title = get("authTitle");
    const description = get("authDescription");
    if (title && description) {
      if (isForgot) {
        title.textContent = "Reset your password";
        description.textContent = "Enter the email address linked to your account.";
      } else if (isReset) {
        title.textContent = "Choose a new password";
        description.textContent = "Your new password must be at least 8 characters.";
      } else {
        title.textContent = accountMode === "register"
          ? "Create your NALSAFE account"
          : "Sign in or create an account";
        description.textContent = accountMode === "register"
          ? "Create an account to keep your profile available across devices."
          : "Sign in with your email, or choose Create account to register.";
      }
    }

    showMessage("");
  };

  /*
   * Switch between Login and Create Account.
   */
  const setMode = (mode) => {
    accountMode = mode;

    const registering = mode === "register";
    setRecoveryView("account");

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

    if (forgotPasswordRow) {
      forgotPasswordRow.hidden = registering;
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

  get("forgotPasswordButton")?.addEventListener("click", () => {
    get("recoveryEmail").value = accountEmail.value.trim();
    setRecoveryView("forgot");
  });

  document.querySelectorAll("[data-auth-back]").forEach((button) => {
    button.addEventListener("click", () => setMode("login"));
  });

  forgotPasswordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = get("recoverySubmit");
    submit.disabled = true;
    showMessage("Requesting a password reset link…");

    try {
      const response = await window.nalsafeApi.request("/forgot-password", {
        method: "POST",
        body: JSON.stringify({
          email: get("recoveryEmail").value.trim().toLowerCase()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showMessage(data.message || "We could not request a reset link.", true);
        return;
      }
      showMessage(data.message || "If an account exists for that email, a reset link will be sent.");
    } catch (error) {
      console.error("Password recovery request error:", error);
      showMessage("Could not connect to the account service. Please try again.", true);
    } finally {
      submit.disabled = false;
    }
  });

  resetPasswordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = get("newPassword").value;
    const confirmation = get("newPasswordConfirm").value;
    const submit = get("resetSubmit");

    if (password.length < 8) {
      showMessage("Your password must be at least 8 characters.", true);
      return;
    }
    if (password !== confirmation) {
      showMessage("Those passwords don't match yet.", true);
      return;
    }

    submit.disabled = true;
    showMessage("Updating your password…");
    try {
      const response = await window.nalsafeApi.request("/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: resetToken, password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showMessage(data.message || "We could not reset your password.", true);
        return;
      }

      window.history.replaceState({}, "", `${window.location.pathname}`);
      resetPasswordForm.reset();
      setMode("login");
      showMessage(data.message || "Your password has been changed. You can now sign in.");
    } catch (error) {
      console.error("Password reset error:", error);
      showMessage("Could not connect to the account service. Please try again.", true);
    } finally {
      submit.disabled = false;
    }
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

        const requestOptions = {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body),
          ...(registering ? {} : { timeout: 60000 })
        };
        let response;

        try {
          response = await window.nalsafeApi.request(endpoint, requestOptions);
        } catch (error) {
          const canRetry = !registering &&
            navigator.onLine &&
            (error.code === "TIMEOUT" || error instanceof TypeError);

          if (!canRetry) throw error;

          showMessage("The account service is taking longer than usual. Retrying sign in…");
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
          response = await window.nalsafeApi.request(endpoint, requestOptions);
        }

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

        const message = error.code === "TIMEOUT"
          ? error.message
          : !navigator.onLine
            ? "You appear to be offline. Check your internet connection and try again."
            : "Could not connect to the account service. Please try again in a moment.";
        showMessage(message, true);
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
  if (resetToken) {
    setRecoveryView("reset");
  }

})();