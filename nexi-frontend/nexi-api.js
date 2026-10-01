(() => {
  "use strict";

  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);

  const apiBaseUrl = window.NEXI_API_BASE_URL || (
    isLocal
      ? "http://localhost:5000/api"
      : "https://nexi-6qk9.onrender.com/api"
  );

  const TOKEN_KEY = "nexi_token";

  window.nexiApi = {
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

    request(path, options = {}) {
      const token = localStorage.getItem(TOKEN_KEY);

      const headers = new Headers(options.headers || {});

      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      return fetch(`${apiBaseUrl}${path}`, {
        ...options,
        headers,
        credentials: "include"
      });
    }
  };
})();