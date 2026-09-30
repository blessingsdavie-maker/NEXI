(() => {
  "use strict";

  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const apiBaseUrl = window.NEXI_API_BASE_URL || (isLocal
    ? "http://localhost:5000/api"
    : "https://nexi-6qk9.onrender.com/api");

  window.nexiApi = {
    request(path, options = {}) {
      return fetch(`${apiBaseUrl}${path}`, { ...options, credentials: "include" });
    }
  };
})();