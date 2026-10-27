
(() => {
  "use strict";

  const form = document.getElementById("resetPasswordForm");
  const passwordInput = document.getElementById("newPassword");
  const confirmInput = document.getElementById("confirmPassword");
  const submitButton = document.getElementById("resetPasswordSubmit");
  const message = document.getElementById("resetPasswordMessage");

  const params = new URLSearchParams(window.location.search);

  // Accept the new token format and older reset links.
  const token = params.get("token") || params.get("reset") || "";

  function showMessage(text, type = "") {
    message.textContent = text;
    message.classList.remove("is-error", "is-success");

    if (type) {
      message.classList.add(`is-${type}`);
    }
  }

  if (!window.nalsafeApi) {
    showMessage(
      "The account service could not be loaded. Please refresh the page.",
      "error"
    );
    submitButton.disabled = true;
    return;
  }

  if (!token) {
    showMessage(
      "This reset link is missing its security token. Request a new password-reset email.",
      "error"
    );
    submitButton.disabled = true;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!token) {
      showMessage(
        "Request a new password-reset link before continuing.",
        "error"
      );
      return;
    }

    const password = passwordInput.value;
    const confirmPassword = confirmInput.value;

    if (password.length < 8) {
      showMessage(
        "Your password must be at least 8 characters.",
        "error"
      );
      return;
    }

    if (password !== confirmPassword) {
      showMessage(
        "Your passwords do not match.",
        "error"
      );
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Updating password…";

    showMessage("Securely updating your password…");

    try {
      const response = await window.nalsafeApi.request(
        "/reset-password",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            token,
            password
          })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        showMessage(
          data.message ||
            "The password could not be reset. Request a new link and try again.",
          "error"
        );
        return;
      }

      showMessage(
        data.message || "Your password has been changed successfully.",
        "success"
      );

      form.reset();
      submitButton.textContent = "Password updated";

      // Remove the reset token from the address bar.
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );

      window.setTimeout(() => {
        window.location.replace("login.html?mode=login");
      }, 2500);
    } catch (error) {
      console.error("NALSAFE password reset error:", error);

      showMessage(
        "Unable to connect to the account service. Please try again.",
        "error"
      );
    } finally {
      if (submitButton.textContent !== "Password updated") {
        submitButton.disabled = false;
        submitButton.textContent = "Reset password";
      }
    }
  });
})();
