(() => {
  "use strict";

  const isLocal =
    window.location.protocol === "file:" ||
    ["localhost", "127.0.0.1", ""].includes(window.location.hostname);

  const apiBaseUrl = (
    window.NEXI_API_BASE_URL ||
    (isLocal
      ? "http://localhost:5000/api"
      : "https://nexi-6qk9.onrender.com/api")
  ).replace(/\/+$/, "");

  const TOKEN_KEY = "nexi_token";

  const redirectToLogin = () => {
    const current = window.location.pathname.toLowerCase();

    // Never redirect from the login/signup pages themselves.
    if (
      current.endsWith("/login.html") ||
      current.endsWith("/signup.html") ||
      current.endsWith("/register.html")
    ) {
      return;
    }

    window.nexiApi.clearToken();
    window.location.replace("login.html?mode=login");
  };

  const buildHeaders = (headers = {}, hasBody = false) => {
    const finalHeaders = new Headers(headers);

    if (hasBody && !finalHeaders.has("Content-Type")) {
      finalHeaders.set("Content-Type", "application/json");
    }

    if (!finalHeaders.has("Accept")) {
      finalHeaders.set("Accept", "application/json");
    }

    const token = localStorage.getItem(TOKEN_KEY);

    if (token) {
      finalHeaders.set("Authorization", `Bearer ${token}`);
    }

    return finalHeaders;
  };

  const request = async (path, options = {}) => {
    const controller = new AbortController();

    const timeoutMs =
      Number.isFinite(options.timeout)
        ? options.timeout
        : 20000;

    const timeout = window.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const {
        timeout: _timeout,
        signal,
        ...fetchOptions
      } = options;

      const headers = buildHeaders(
        fetchOptions.headers || {},
        Boolean(fetchOptions.body)
      );

      const response = await fetch(`${apiBaseUrl}${path}`, {
        ...fetchOptions,
        headers,
        credentials: "include",
        signal: signal || controller.signal
      });

      if (response.status === 401) {
        window.dispatchEvent(
          new CustomEvent("nexi:auth-expired", {
            detail: { path }
          })
        );
      }

      return response;
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error(
          "The request timed out. Please check your connection and try again."
        );
        timeoutError.code = "TIMEOUT";
        throw timeoutError;
      }

      if (!navigator.onLine) {
        const offlineError = new Error(
          "You appear to be offline. Check your internet connection and try again."
        );
        offlineError.code = "OFFLINE";
        throw offlineError;
      }

      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const requestJson = async (path, options = {}) => {
    const response = await request(path, options);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(
        data.message ||
        data.error ||
        `The request failed with status ${response.status}.`
      );

      error.status = response.status;
      error.data = data;

      throw error;
    }

    return data;
  };

  window.nexiApi = {
    apiBaseUrl,

    getToken() {
      return localStorage.getItem(TOKEN_KEY);
    },

    setToken(token) {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      }
    },

    clearToken() {
      localStorage.removeItem(TOKEN_KEY);
    },

    isAuthenticated() {
      return Boolean(localStorage.getItem(TOKEN_KEY));
    },

    request,

    requestJson,

    redirectToLogin
  };

  window.addEventListener("nexi:auth-expired", () => {
    window.nexiApi.clearToken();
  });
})();