(async () => {
  "use strict";

  const get = (id) => document.getElementById(id);
  const role = document.body.dataset.role;
  const api = async (path, options = {}) => {
    const response = await window.nexiApi.request(path, {
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "The request could not be completed.");
    return data;
  };
  const showError = (error) => {
    let notice = get("portalError");
    if (!notice) {
      notice = document.createElement("p");
      notice.id = "portalError";
      notice.className = "notice-box is-error";
      notice.setAttribute("role", "alert");
      get("portalMain")?.prepend(notice);
    }
    notice.textContent = error.message || "The request could not be completed.";
  };
  const showMessage = (element, text, isError = false) => {
    if (!element) return;
    element.textContent = text;
    element.classList.toggle("is-error", isError);
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const formatTime = (value) => new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
  const formatDate = (value) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));

  let userSession;
  try {
    const session = await api("/me");
    userSession = session.user;
    if ((role === "admin") !== (userSession.role === "admin")) {
      window.location.replace(userSession.role === "admin" ? "admin-dashboard.html" : "user-dashboard.html");
      return;
    }
  } catch {
    window.location.replace("login.html?mode=login");
    return;
  }

  const themeKey = "nexi-theme";
  const themeButton = get("portalTheme");
  let theme = localStorage.getItem(themeKey);
  const setTheme = () => {
    if (theme === "dark") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    themeButton?.setAttribute("aria-label", theme === "dark" ? "Use light theme" : "Use dark theme");
  };
  setTheme();
  themeButton?.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    localStorage.setItem(themeKey, theme);
    setTheme();
  });

  const sidebar = get("portalSidebar");
  const menuButton = get("portalMenu");
  menuButton?.addEventListener("click", () => {
    const open = sidebar.classList.toggle("is-open");
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close dashboard menu" : "Open dashboard menu");
  });
  document.querySelectorAll("[data-view-target]").forEach((button) => button.addEventListener("click", () => {
    const target = button.dataset.viewTarget;
    document.querySelectorAll("[data-view-target]").forEach((item) => item.removeAttribute("aria-current"));
    button.setAttribute("aria-current", "page");
    document.querySelectorAll(".portal-view").forEach((view) => view.classList.toggle("is-active", view.id === target));
    sidebar?.classList.remove("is-open");
    menuButton?.setAttribute("aria-expanded", "false");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  document.querySelectorAll("[data-open-view]").forEach((button) => button.addEventListener("click", () => {
    document.querySelector(`[data-view-target="${button.dataset.openView}"]`)?.click();
  }));
  get("portalDate")?.replaceChildren(document.createTextNode(new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())));
  get("portalYear")?.replaceChildren(document.createTextNode(String(new Date().getFullYear())));
  document.querySelectorAll("[data-user-signout]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await api("/logout", { method: "POST" });
      window.nexiApi.clearToken();
      window.location.replace("login.html?mode=login");
    } catch (error) {
      button.disabled = false;
      showError(error);
    }
  }));

  if (role === "user") await setupUser();
  if (role === "admin") await setupAdmin();

  async function setupUser() {
  const profileName = String(userSession.full_name || "Nexi member").trim();

  const initials = profileName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  get("userGreetingName").textContent =
    profileName.split(/\s+/)[0] || "there";

  get("userProfileName").textContent = profileName;
  get("userAvatar").textContent = initials;
  get("userProfileDisplayName").textContent = profileName;
  get("userProfileEmail").textContent = userSession.email || "Email unavailable";
  get("userProfileAvatar").textContent = initials;

  let dashboard = {
    members: [],
    checkins: [],
    activity: [],
    reminder: {
      enabled: false,
      time: "19:00"
    }
  };

  try {
    dashboard = await api("/dashboard");
  } catch (error) {
    showError(new Error("Your dashboard data is temporarily unavailable. Some details may be limited until the service is back."));
  }

  const NOTIFICATION_READ_KEY =
    `nexi-read-notifications-${userSession.id}`;

  const notificationReadState = new Set(
    JSON.parse(localStorage.getItem(NOTIFICATION_READ_KEY) || "[]")
  );

  const todayKey = (value = new Date()) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  };

  const isToday = (value) => {
    return todayKey(value) === todayKey(new Date());
  };

  const safeCheckins = () =>
    Array.isArray(dashboard.checkins)
      ? dashboard.checkins.filter((item) => item && isToday(item.created_at))
      : [];

  const members = () =>
    Array.isArray(dashboard.members)
      ? dashboard.members
      : [];

  const activity = () =>
    Array.isArray(dashboard.activity)
      ? dashboard.activity
      : [];

  const todayMemberCheckins = () => {
    const map = new Map();

    safeCheckins()
      .sort(
        (a, b) =>
          new Date(b.created_at) - new Date(a.created_at)
      )
      .forEach((checkin) => {
        if (!map.has(checkin.user_id)) {
          map.set(checkin.user_id, checkin);
        }
      });

    return map;
  };

  const formatCheckinStatus = (checkin) => {
    if (!checkin) return "No update";

    if (checkin.status === "safe") {
      return "Safe";
    }

    if (checkin.status === "support") {
      return "Support";
    }

    return String(checkin.status || "Updated");
  };

  const statusClass = (status) => {
    if (status === "Safe") {
      return "";
    }

    if (status === "Support") {
      return "pending";
    }

    if (status === "Invited") {
      return "pending";
    }

    return "offline";
  };

  const saveNotificationReads = () => {
    localStorage.setItem(
      NOTIFICATION_READ_KEY,
      JSON.stringify([...notificationReadState].slice(-200))
    );
  };

  const memberInitials = (name) =>
    String(name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  const getMemberId = (member) =>
    member.member_user_id ||
    member.user_id ||
    member.id ||
    "";

  const latestCheckins = () => {
    const latest = new Map();

    safeCheckins()
      .sort(
        (a, b) =>
          new Date(b.created_at) - new Date(a.created_at)
      )
      .forEach((checkin) => {
        if (!latest.has(checkin.user_id)) {
          latest.set(checkin.user_id, checkin);
        }
      });

    return latest;
  };

  const ownTodayCheckin = () =>
    safeCheckins()
      .filter(
        (checkin) =>
          String(checkin.user_id) === String(userSession.id)
      )
      .sort(
        (a, b) =>
          new Date(b.created_at) - new Date(a.created_at)
      )[0] || null;

  const renderConnectionState = () => {
    let indicator = get("nexiConnectionState");

    if (!indicator) {
      indicator = document.createElement("span");
      indicator.id = "nexiConnectionState";
      indicator.className = "state-dot";
      indicator.style.marginLeft = "auto";
      indicator.style.whiteSpace = "nowrap";

      const heading = document.querySelector(".view-heading");

      if (heading) {
        heading.append(indicator);
      }
    }

    if (navigator.onLine) {
      indicator.textContent = "● Online";
      indicator.className = "state-dot";
    } else {
      indicator.textContent = "● Offline";
      indicator.className = "state-dot offline";
    }
  };

  const renderRefreshControl = () => {
    if (get("dashboardRefreshButton")) {
      return;
    }

    const heading = document.querySelector("#userOverview .view-heading");

    if (!heading) {
      return;
    }

    const button = document.createElement("button");
    button.id = "dashboardRefreshButton";
    button.type = "button";
    button.className = "button button-secondary button-small";
    button.textContent = "↻ Refresh";
    button.setAttribute("aria-label", "Refresh dashboard");

    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Refreshing…";

      try {
        await refreshDashboard();
      } finally {
        button.disabled = false;
        button.textContent = "↻ Refresh";
      }
    });

    heading.append(button);
  };

  const renderMembers = () => {
    const checkinMap = latestCheckins();

    const searchInput = get("circleMemberSearch");
    const searchTerm =
      searchInput?.value.trim().toLowerCase() || "";

    const filteredMembers = members().filter((member) =>
      String(member.full_name || "")
        .toLowerCase()
        .includes(searchTerm)
    );

    const rows = filteredMembers.map((member, index) => {
      const memberId = getMemberId(member);
      const checkin = checkinMap.get(memberId);

      const invited =
        String(member.status || "").toLowerCase() === "invited";

      const status = invited
        ? "Invited"
        : formatCheckinStatus(checkin);

      const note = invited
        ? "Invitation pending"
        : checkin
          ? `Updated ${formatTime(checkin.created_at)}`
          : "No check-in today";

      const initialsText = memberInitials(member.full_name);

      const palette = [
        "teal",
        "gold",
        "blue",
        "plum"
      ];

      return `
        <div class="member-row"
             data-circle-member
             data-member-search="${escapeHtml(
               String(member.full_name || "").toLowerCase()
             )}">
          <div class="member-detail">
            <span class="member-avatar ${palette[index % palette.length]}">
              ${escapeHtml(initialsText)}
            </span>

            <span>
              <b>${escapeHtml(member.full_name || "Unnamed member")}</b>
              <small>${escapeHtml(note)}</small>
            </span>
          </div>

          <span class="member-meta">
            <span class="state-dot ${statusClass(status)}">
              ${escapeHtml(status)}
            </span>
          </span>
        </div>
      `;
    });

    const html = rows.length
      ? rows.join("")
      : `<div class="empty-state">
          ${
            searchTerm
              ? "No circle members match your search."
              : "Your circle is empty. Invite someone you trust."
          }
        </div>`;

    ["userMemberList", "userCircleMemberList"].forEach((id) => {
      if (get(id)) {
        get(id).innerHTML = html;
      }
    });

    const count = members().length;

    if (get("userCircleMembersLabel")) {
      get("userCircleMembersLabel").textContent =
        `${count} ${count === 1 ? "person" : "people"}`;
    }

    if (get("userCircleCount")) {
      get("userCircleCount").textContent = String(count);
    }

    if (get("userMemberCount")) {
      get("userMemberCount").textContent =
        `${count} ${count === 1 ? "person" : "people"}`;
    }

    /*
     * IMPORTANT:
     * Only count today's check-ins.
     * Also only count users represented in the current circle.
     */
    const memberIds = new Set(
      members()
        .map(getMemberId)
        .filter(Boolean)
        .map(String)
    );

    let checked = 0;

    latestCheckins().forEach((checkin, userId) => {
      if (
        memberIds.size === 0 ||
        memberIds.has(String(userId))
      ) {
        checked += 1;
      }
    });

    /*
     * If the authenticated user is not included in
     * dashboard.members, include their own check-in in
     * the circle total only if the current API already
     * represents the user inside that count.
     */
    if (
      memberIds.size > 0 &&
      String(userSession.id) &&
      latestCheckins().has(userSession.id) &&
      !memberIds.has(String(userSession.id))
    ) {
      checked = Math.min(checked, count);
    }

    if (get("userCheckedCount")) {
      get("userCheckedCount").textContent =
        `${Math.min(checked, count)} / ${count}`;
    }
  };

  const addCircleSearch = () => {
    if (get("circleMemberSearch")) {
      return;
    }

    const panelHeading = document.querySelector(
      "#userCircle .panel-heading"
    );

    if (!panelHeading) {
      return;
    }

    const search = document.createElement("input");

    search.id = "circleMemberSearch";
    search.type = "search";
    search.className = "input-control";
    search.placeholder = "Search members…";
    search.setAttribute("aria-label", "Search circle members");
    search.style.maxWidth = "230px";

    panelHeading.append(search);

    search.addEventListener("input", renderMembers);
  };

  const renderCheckin = () => {
    const checkin = ownTodayCheckin();

    const banner = get("userCheckinBanner");
    const action = get("userCheckinAction");
    const update = get("userMemberStatus");
    const pill = get("userMemberStatusDot");

    if (!banner || !action) {
      return;
    }

    if (!checkin) {
      get("userCheckinText").textContent =
        "A quick check-in records your update for your circle.";

      action.textContent = "I'm safe";
      action.dataset.checkinAction = "safe";

      banner.classList.remove(
        "is-checked",
        "is-help"
      );

      if (update) {
        update.textContent = "Waiting for your update";
        update.className = "state-dot pending";
      }

      if (pill) {
        pill.textContent = "Pending";
        pill.className = "state-dot pending";
      }
    } else {
      const isSafe = checkin.status === "safe";

      get("userCheckinText").textContent = isSafe
        ? "Your safe check-in is saved for your circle."
        : "Your support check-in is saved for your circle. It does not contact emergency services.";

      action.textContent = "Clear today's check-in";
      action.dataset.checkinAction = "reset";

      banner.classList.toggle("is-checked", isSafe);
      banner.classList.toggle("is-help", !isSafe);

      if (update) {
        update.textContent =
          `${isSafe ? "Safe" : "Support"}, ${formatTime(checkin.created_at)}`;

        update.className = isSafe
          ? "state-dot"
          : "state-dot pending";
      }

      if (pill) {
        pill.textContent =
          isSafe ? "Safe" : "Support";

        pill.className =
          isSafe
            ? "state-dot"
            : "state-dot pending";
      }
    }
  };

  const notificationId = (item, index) =>
    String(
      item.id ||
      `${item.status}-${item.created_at}-${index}`
    );

  const renderActivity = () => {
    const items = activity()
      .filter((item) => item && item.created_at)
      .sort(
        (a, b) =>
          new Date(b.created_at) -
          new Date(a.created_at)
      );

    const rows = items.map((item, index) => {
      const isSupport =
        item.status === "support";

      const label = isSupport
        ? "Support check-in"
        : "Safe check-in";

      return `
        <div class="quick-row">
          <span>
            <b>${label}</b>
            <small>
              ${escapeHtml(formatDate(item.created_at))}
              ·
              ${escapeHtml(formatTime(item.created_at))}
            </small>
          </span>

          <span class="state-dot ${
            isSupport ? "pending" : ""
          }">
            ${isSupport ? "Support" : "Safe"}
          </span>
        </div>
      `;
    });

    const content = rows.length
      ? rows.join("")
      : `<div class="empty-state">
          Your check-in activity will appear here.
        </div>`;

    if (get("userActivityList")) {
      get("userActivityList").innerHTML = content;
    }

    renderNotifications(items);
  };

  const renderNotifications = (items) => {
    const rows = [];

    const pendingInvitations = members().filter(
      (member) =>
        String(member.status || "").toLowerCase() === "invited"
    );

    pendingInvitations.forEach((member, index) => {
      const id = `invite-${getMemberId(member) || index}`;

      rows.push({
        id,
        title: "Circle invitation pending",
        description:
          `${member.full_name || "A member"} has a pending invitation.`,
        time: "",
        unread: !notificationReadState.has(id)
      });
    });

    items.slice(0, 30).forEach((item, index) => {
      const id = notificationId(item, index);

      rows.push({
        id,
        title:
          item.status === "support"
            ? "Support check-in saved"
            : "Safe check-in saved",
        description:
          "Your check-in activity has been saved to your Nexi account.",
        time:
          `${formatDate(item.created_at)} · ${formatTime(item.created_at)}`,
        unread: !notificationReadState.has(id)
      });
    });

    if (get("userNotificationsList")) {
      if (!rows.length) {
        get("userNotificationsList").innerHTML =
          `<div class="empty-state">
            You have no new account or circle notifications.
          </div>`;
      } else {
        get("userNotificationsList").innerHTML =
          rows.map((item) => `
            <div class="quick-row"
                 data-notification-id="${escapeHtml(item.id)}">
              <span>
                <b>
                  ${escapeHtml(item.title)}
                </b>

                <small>
                  ${escapeHtml(item.description)}
                  ${item.time ? ` · ${escapeHtml(item.time)}` : ""}
                </small>
              </span>

              <button
                class="button button-secondary button-small"
                type="button"
                data-mark-notification-read="${escapeHtml(item.id)}">
                ${item.unread ? "Mark read" : "Read"}
              </button>
            </div>
          `).join("");
      }
    }

    const unreadCount =
      rows.filter((item) => item.unread).length;

    updateNotificationBadge(unreadCount);

    document
      .querySelectorAll("[data-mark-notification-read]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.dataset.markNotificationRead;

          if (!id) {
            return;
          }

          notificationReadState.add(id);
          saveNotificationReads();

          button.textContent = "Read";

          const container =
            button.closest("[data-notification-id]");

          if (container) {
            container.classList.add("is-read");
          }

          renderNotifications(items);
        });
      });
  };

  const updateNotificationBadge = (unreadCount) => {
    const button = document.querySelector(
      ".notification-button"
    );

    if (!button) {
      return;
    }

    let badge = button.querySelector(
      ".notification-badge"
    );

    if (unreadCount <= 0) {
      badge?.remove();
      button.removeAttribute("data-unread");
      return;
    }

    if (!badge) {
      badge = document.createElement("span");
      badge.className = "notification-badge";
      button.append(badge);
    }

    badge.textContent =
      unreadCount > 99
        ? "99+"
        : String(unreadCount);

    button.dataset.unread = "true";
  };

  const setReminderText = () => {
    const reminder = dashboard.reminder || {
      enabled: false,
      time: "19:00"
    };

    const displayTime = reminder.time
      ? formatTime(`2000-01-01T${reminder.time}:00`)
      : "7:00 PM";

    if (get("scheduleSummary")) {
      get("scheduleSummary").textContent =
        reminder.enabled
          ? displayTime
          : "Paused";
    }

    if (get("scheduleFoot")) {
      get("scheduleFoot").textContent =
        reminder.enabled
          ? "Preference saved to your account"
          : "Reminder preference paused";
    }

    if (get("scheduleSaved")) {
      get("scheduleSaved").textContent =
        reminder.enabled
          ? `Preference saved for ${reminder.time}. Delivery is not configured.`
          : "Reminder preference paused for your account.";
    }
  };

  const requestBrowserNotificationPermission = async () => {
    if (!("Notification" in window)) {
      return "unsupported";
    }

    if (Notification.permission === "default") {
      try {
        return await Notification.requestPermission();
      } catch {
        return "denied";
      }
    }

    return Notification.permission;
  };

  const maybeNotify = (message) => {
    if (
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    try {
      new Notification("Nexi", {
        body: message,
        icon: "favicon.ico"
      });
    } catch {
      // Browser notification failed silently.
    }
  };

  const refreshDashboard = async ({
    notify = false
  } = {}) => {
    const previousActivityLength = activity().length;

    try {
      dashboard = await api("/dashboard");

      renderMembers();
      renderCheckin();
      renderActivity();
      setReminderText();

      renderConnectionState();

      if (
        notify &&
        activity().length > previousActivityLength
      ) {
        maybeNotify("Your Nexi dashboard has a new update.");
      }

      return dashboard;
    } catch (error) {
      renderConnectionState();
      showError(new Error("The dashboard is temporarily unavailable. Your latest saved view remains open."));
      return dashboard;
    }
  };

  /*
   * Initial UI setup
   */
  renderConnectionState();
  renderRefreshControl();
  addCircleSearch();

  /*
   * Online/offline awareness
   */
  window.addEventListener(
    "online",
    () => {
      renderConnectionState();
      refreshDashboard({ notify: false }).catch(showError);
    }
  );

  window.addEventListener(
    "offline",
    () => {
      renderConnectionState();
    }
  );

  /*
   * Central authentication expiration handler.
   */
  window.addEventListener(
    "nexi:auth-expired",
    () => {
      window.nexiApi.clearToken();
      window.location.replace("login.html?mode=login");
    },
    { once: true }
  );

  /*
   * Reminder controls
   */
  const scheduleToggle = get(
    "userScheduleEnabled"
  );

  const scheduleTime = get(
    "userScheduleTime"
  );

  if (scheduleToggle && scheduleTime) {
    scheduleToggle.checked =
      Boolean(dashboard.reminder?.enabled);

    scheduleTime.value =
      dashboard.reminder?.time || "19:00";

    setReminderText();

    const saveReminder = async () => {
      scheduleToggle.disabled = true;
      scheduleTime.disabled = true;

      try {
        const saved = await api("/reminder", {
          method: "PUT",
          body: JSON.stringify({
            enabled: scheduleToggle.checked,
            time: scheduleTime.value || "19:00"
          })
        });

        dashboard.reminder =
          saved.reminder;

        setReminderText();

        const permission =
          await requestBrowserNotificationPermission();

        if (permission === "granted") {
          maybeNotify(
            "Your Nexi reminder preference was updated."
          );
        }
      } catch (error) {
        showError(error);
      } finally {
        scheduleToggle.disabled = false;
        scheduleTime.disabled = false;
      }
    };

    scheduleToggle.addEventListener(
      "change",
      saveReminder
    );

    scheduleTime.addEventListener(
      "change",
      saveReminder
    );
  }

  /*
   * Main check-in button
   */
  const checkinButton =
    get("userCheckinAction");

  if (checkinButton) {
    checkinButton.addEventListener(
      "click",
      async (event) => {
        const button =
          event.currentTarget;

        button.disabled = true;

        try {
          if (
            button.dataset.checkinAction ===
            "reset"
          ) {
            await api(
              "/checkins/today",
              {
                method: "DELETE"
              }
            );
          } else {
            await api(
              "/checkins",
              {
                method: "POST",
                body: JSON.stringify({
                  status: "safe"
                })
              }
            );

            maybeNotify(
              "Your safe check-in has been saved."
            );
          }

          await refreshDashboard();
        } catch (error) {
          showError(error);
        } finally {
          button.disabled = false;
        }
      }
    );
  }

  /*
   * Support check-in
   */
  document
    .querySelectorAll("[data-request-support]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const dialog =
          get("supportConfirmDialog");

        if (!dialog) {
          return;
        }

        if (typeof dialog.showModal === "function") {
          dialog.showModal();
        } else {
          dialog.setAttribute("open", "");
        }
      });
    });

  const supportButton =
    get("confirmUserSupport");

  if (supportButton) {
    supportButton.addEventListener(
      "click",
      async () => {
        supportButton.disabled = true;

        try {
          await api("/checkins", {
            method: "POST",
            body: JSON.stringify({
              status: "support"
            })
          });

          await refreshDashboard();

          maybeNotify(
            "Your support check-in has been saved."
          );

          get("supportConfirmDialog")?.close();
        } catch (error) {
          showError(error);
        } finally {
          supportButton.disabled = false;
        }
      }
    );
  }

  document
    .querySelectorAll("[data-close-dialog]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () =>
          get("supportConfirmDialog")?.close()
      );
    });

  get("supportConfirmDialog")
    ?.addEventListener("click", (event) => {
      if (
        event.target ===
        event.currentTarget
      ) {
        event.currentTarget.close();
      }
    });

  /*
   * Invitation
   */
  const inviteForm =
    get("inviteMemberForm");

  if (inviteForm) {
    inviteForm.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const form =
          event.currentTarget;

        const submit =
          form.querySelector(
            "button[type=submit]"
          );

        const message =
          get("inviteMemberMessage");

        submit.disabled = true;

        try {
          const result =
            await api(
              "/circle/invitations",
              {
                method: "POST",
                body: JSON.stringify({
                  full_name:
                    get("inviteMemberName")
                      .value
                      .trim(),

                  email:
                    get("inviteMemberEmail")
                      .value
                      .trim()
                })
              }
            );

          form.reset();

          showMessage(
            message,
            result.invitation.email_sent
              ? "Invitation email sent successfully."
              : "Invitation created successfully. Use the link below to share it."
          );

          if (
            result.invitation.invite_url
          ) {
            const wrapper =
              document.createElement("div");

            wrapper.style.marginTop =
              "10px";

            const link =
              document.createElement("a");

            link.href =
              result.invitation.invite_url;

            link.target = "_blank";
            link.rel = "noopener";
            link.textContent =
              "Open invitation";

            const copy =
              document.createElement("button");

            copy.type = "button";
            copy.className =
              "button button-secondary button-small";

            copy.style.marginLeft =
              "8px";

            copy.textContent =
              "Copy link";

            copy.addEventListener(
              "click",
              async () => {
                try {
                  await navigator.clipboard.writeText(
                    result.invitation.invite_url
                  );

                  copy.textContent =
                    "Copied";

                  window.setTimeout(() => {
                    copy.textContent =
                      "Copy link";
                  }, 1800);
                } catch {
                  showMessage(
                    message,
                    "The link was created, but your browser did not allow automatic copying.",
                    true
                  );
                }
              }
            );

            wrapper.append(
              link,
              copy
            );

            message.append(wrapper);
          }

          dashboard =
            await api("/dashboard");

          renderMembers();
          renderNotifications(
            activity()
          );

          maybeNotify(
            "Your circle invitation was created."
          );
        } catch (error) {
          showMessage(
            message,
            error.message,
            true
          );
        } finally {
          submit.disabled = false;
        }
      }
    );
  }

  /*
   * Mark all notifications as read.
   */
  const addMarkAllRead = () => {
    if (
      !get("userNotificationsList") ||
      get("markAllNotificationsRead")
    ) {
      return;
    }

    const panel =
      get("userNotificationsList")
        .closest(".panel");

    if (!panel) {
      return;
    }

    const button =
      document.createElement("button");

    button.id =
      "markAllNotificationsRead";

    button.type = "button";
    button.className =
      "button button-secondary button-small";

    button.textContent =
      "Mark all as read";

    const heading =
      panel.querySelector(".panel-heading");

    heading?.append(button);

    button.addEventListener(
      "click",
      () => {
        const current =
          activity();

        current.forEach(
          (item, index) => {
            notificationReadState.add(
              notificationId(
                item,
                index
              )
            );
          }
        );

        members()
          .filter(
            (member) =>
              String(
                member.status || ""
              ).toLowerCase() ===
              "invited"
          )
          .forEach(
            (member, index) => {
              notificationReadState.add(
                `invite-${getMemberId(member) || index}`
              );
            }
          );

        saveNotificationReads();
        renderNotifications(current);
      }
    );
  };

  addMarkAllRead();

  /*
   * Refresh dashboard automatically every 30 seconds.
   * This gives Nexi a near-live experience without
   * requiring WebSockets yet.
   */
  const refreshInterval =
    window.setInterval(() => {
      if (
        document.hidden ||
        !navigator.onLine
      ) {
        return;
      }

      refreshDashboard({
        notify: true
      }).catch(() => {
        // Do not repeatedly interrupt the user
        // with errors during background refresh.
      });
    }, 30000);

  /*
   * Refresh immediately when the tab becomes visible.
   */
  document.addEventListener(
    "visibilitychange",
    () => {
      if (
        !document.hidden &&
        navigator.onLine
      ) {
        refreshDashboard({
          notify: false
        }).catch(() => {});
      }
    }
  );

  /*
   * Clean up interval if the page is unloaded.
   */
  window.addEventListener(
    "beforeunload",
    () => {
      window.clearInterval(
        refreshInterval
      );
    }
  );

  /*
   * Initial rendering.
   */
  renderMembers();
  renderCheckin();
  renderActivity();
  setReminderText();
  renderConnectionState();
}

  async function setupAdmin() {
    const memberRows = get("adminMemberRows");
    const renderMembers = async () => {
      const query = get("adminMemberSearch").value.trim();
      const status = get("adminMemberFilter").value.toLowerCase();
      const { members } = await api(`/admin/members?search=${encodeURIComponent(query)}&status=${encodeURIComponent(status === "all" ? "" : status)}`);
      memberRows.innerHTML = members.map((member, index) => {
        const paused = member.status === "paused";
        const initials = member.full_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
        return `<tr><td><div class="member-detail"><span class="member-avatar ${index % 2 ? "blue" : "teal"}">${escapeHtml(initials)}</span><span><b>${escapeHtml(member.full_name)}</b><small>${escapeHtml(member.email)}</small></span></div></td><td>${escapeHtml(member.circle || "No circle")}</td><td>${escapeHtml(formatDate(member.created_at))}</td><td><span class="status-pill ${paused ? "paused" : ""}">${paused ? "Paused" : "Active"}</span></td><td><div class="table-actions"><button class="button button-secondary button-small" type="button" data-member-id="${escapeHtml(member.id)}" data-next-status="${paused ? "active" : "paused"}">${paused ? "Restore" : "Pause"}</button></div></td></tr>`;
      }).join("");
      get("adminMemberEmpty").hidden = members.length > 0;
      memberRows.querySelectorAll("[data-member-id]").forEach((button) => button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await api(`/admin/members/${button.dataset.memberId}/status`, { method: "PATCH", body: JSON.stringify({ status: button.dataset.nextStatus }) });
          await renderMembers();
          await loadOverview();
        } catch (error) { showError(error); }
      }));
    };

    const loadOverview = async () => {
      const [overview, checkins] = await Promise.all([api("/admin/overview"), api("/admin/checkins")]);
      get("adminActiveCount").textContent = String(overview.members.active);
      get("adminCircleCount").textContent = String(overview.circles);
      get("adminCheckinsPending").textContent = String(overview.checkins_pending);
      get("adminReviewCount").textContent = String(overview.directory_pending);
      get("adminReviewCountLabel").textContent = String(overview.directory_pending);
      get("adminReviewCountSummary").textContent = String(overview.directory_pending);
      const rows = checkins.circles.map((circle) => `<div class="quick-row"><span><b>${escapeHtml(circle.name)}</b><small>${circle.members} active members${circle.last_update ? ` · updated ${escapeHtml(formatTime(circle.last_update))}` : ""}</small></span><span class="state-dot ${circle.pending ? "pending" : ""}">${circle.checked_in} / ${circle.members} checked in</span></div>`);
      get("adminTodayCheckins").innerHTML = rows.length ? rows.join("") : '<div class="empty-state">No circles have been created yet.</div>';
      get("adminCheckinsTableRows").innerHTML = checkins.circles.length ? checkins.circles.map((circle) => `<tr><td><b>${escapeHtml(circle.name)}</b></td><td>${circle.members}</td><td>${circle.checked_in} / ${circle.members}</td><td>${circle.last_update ? escapeHtml(formatTime(circle.last_update)) : "No updates"}</td><td><span class="status-pill ${circle.pending ? "review" : ""}">${circle.pending ? `${circle.pending} pending` : "Complete"}</span></td></tr>`).join("") : '<tr><td colspan="5">No circles have been created yet.</td></tr>';
    };

    const renderDirectory = async () => {
      const { listings } = await api("/admin/directory");
      get("adminDirectoryRows").innerHTML = listings.map((listing) => `<tr><td><b>${escapeHtml(listing.name)}</b></td><td>${escapeHtml(listing.category)}</td><td>${escapeHtml(listing.area)}</td><td><span class="status-pill ${listing.verified ? "" : "review"}">${listing.verified ? "Verified" : "Review"}</span></td><td><div class="table-actions"><button class="button ${listing.verified ? "button-secondary" : "button-primary"} button-small" type="button" data-listing-id="${escapeHtml(listing.id)}" data-verified="${!listing.verified}">${listing.verified ? "Mark for review" : "Verify listing"}</button></div></td></tr>`).join("");
      if (!listings.length) get("adminDirectoryRows").innerHTML = '<tr><td colspan="5">No service listings have been added.</td></tr>';
      get("adminReviewCount").textContent = String(listings.filter((listing) => !listing.verified).length);
      get("adminReviewCountLabel").textContent = get("adminReviewCount").textContent;
      get("adminReviewCountSummary").textContent = get("adminReviewCount").textContent;
      get("adminDirectoryRows").querySelectorAll("[data-listing-id]").forEach((button) => button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await api(`/admin/directory/${button.dataset.listingId}`, { method: "PATCH", body: JSON.stringify({ verified: button.dataset.verified === "true" }) });
          await renderDirectory();
          await loadOverview();
        } catch (error) { showError(error); }
      }));
    };

    get("adminMemberSearch").addEventListener("input", () => renderMembers().catch(showError));
    get("adminMemberFilter").addEventListener("change", () => renderMembers().catch(showError));
    document.querySelector("[data-focus-invite]")?.addEventListener("click", () => {
      get("adminInviteName").focus();
      get("adminInviteName").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    get("adminInviteForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector("button[type=submit]");
      const message = get("adminInviteMessage");
      submit.disabled = true;
      try {
        const result = await api("/admin/invitations", {
          method: "POST",
          body: JSON.stringify({ full_name: get("adminInviteName").value.trim(), email: get("adminInviteEmail").value.trim() })
        });
        form.reset();
        showMessage(message, result.invitation.email_sent ? "Invitation email sent." : "Invitation created. Share this link with the invited person:");
        if (result.invitation.invite_url) {
          const link = document.createElement("a");
          link.href = result.invitation.invite_url;
          link.textContent = " Open invitation";
          message.append(link);
        }
      } catch (error) { showMessage(message, error.message, true); }
      finally { submit.disabled = false; }
    });

    get("adminExport").addEventListener("click", async () => {
      try {
        const { circles } = await api("/admin/checkins");
        const rows = [["Circle", "Members", "Checked in", "Pending", "Last update"], ...circles.map((circle) => [
          circle.name, circle.members, circle.checked_in, circle.pending, circle.last_update ? new Date(circle.last_update).toISOString() : ""
        ])];
        const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        link.download = "nexi-check-in-summary.csv";
        link.click();
        URL.revokeObjectURL(link.href);
      } catch (error) { showError(error); }
    });

    get("adminDirectoryForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector("button[type=submit]");
      const message = get("adminDirectoryMessage");
      submit.disabled = true;
      try {
        await api("/admin/directory", {
          method: "POST",
          body: JSON.stringify({
            name: get("listingName").value.trim(),
            category: get("listingCategory").value.trim(),
            area: get("listingArea").value.trim(),
            contact: get("listingContact").value.trim() || null
          })
        });
        form.reset();
        showMessage(message, "Listing saved and added to the review queue.");
        await Promise.all([renderDirectory(), loadOverview()]);
      } catch (error) { showMessage(message, error.message, true); }
      finally { submit.disabled = false; }
    });

    get("adminProfileName").textContent = userSession.full_name;

    await Promise.all([loadOverview(), renderMembers(), renderDirectory()]);
  }
})();