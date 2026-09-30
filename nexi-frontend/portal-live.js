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
      window.location.replace("login.html?mode=login");
    } catch (error) {
      button.disabled = false;
      showError(error);
    }
  }));

  if (role === "user") await setupUser();
  if (role === "admin") await setupAdmin();

  async function setupUser() {
    const profileName = userSession.full_name.trim();
    const initials = profileName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    get("userGreetingName").textContent = profileName.split(/\s+/)[0];
    get("userProfileName").textContent = profileName;
    get("userAvatar").textContent = initials;
    get("userProfileDisplayName").textContent = profileName;
    get("userProfileEmail").textContent = userSession.email;
    get("userProfileAvatar").textContent = initials;
    const dashboard = await api("/dashboard");
    const todayCheckin = () => dashboard.checkins.find((checkin) => checkin.user_id === userSession.id);

    const renderMembers = () => {
      const latest = new Map();
      dashboard.checkins.forEach((checkin) => {
        if (!latest.has(checkin.user_id)) latest.set(checkin.user_id, checkin);
      });
      const html = dashboard.members.map((member, index) => {
        const checkin = latest.get(member.member_user_id);
        const status = member.status === "invited" ? "Invited" : checkin?.status === "safe" ? "Safe" : checkin?.status === "support" ? "Support" : "No update";
        const note = member.status === "invited" ? "Invitation pending" : checkin ? `Updated ${formatTime(checkin.created_at)}` : "No check-in today";
        const initialsText = String(member.full_name || "?").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
        const stateClass = status === "Safe" ? "" : status === "Invited" || status === "Support" ? "pending" : "offline";
        return `<div class="member-row"><div class="member-detail"><span class="member-avatar ${["teal", "gold", "blue", "plum"][index % 4]}">${escapeHtml(initialsText)}</span><span><b>${escapeHtml(member.full_name)}</b><small>${escapeHtml(note)}</small></span></div><span class="member-meta"><span class="state-dot ${stateClass}">${escapeHtml(status)}</span></span></div>`;
      }).join("");
      ["userMemberList", "userCircleMemberList"].forEach((id) => { if (get(id)) get(id).innerHTML = html; });
      const count = dashboard.members.length;
      if (get("userCircleMembersLabel")) get("userCircleMembersLabel").textContent = `${count} people`;
      if (get("userCircleCount")) get("userCircleCount").textContent = String(count);
      if (get("userMemberCount")) get("userMemberCount").textContent = `${count} people`;
      const checked = latest.size;
      if (get("userCheckedCount")) get("userCheckedCount").textContent = `${checked} / ${count}`;
    };

    const renderCheckin = () => {
      const checkin = todayCheckin();
      const banner = get("userCheckinBanner");
      const action = get("userCheckinAction");
      const update = get("userMemberStatus");
      const pill = get("userMemberStatusDot");
      if (!checkin) {
        get("userCheckinText").textContent = "A quick check-in records your update for your circle.";
        action.textContent = "I'm safe";
        action.dataset.checkinAction = "safe";
        banner.classList.remove("is-checked", "is-help");
        update.textContent = "Waiting for your update";
        update.className = "state-dot pending";
        pill.textContent = "Pending";
        pill.className = "state-dot pending";
      } else {
        const isSafe = checkin.status === "safe";
        get("userCheckinText").textContent = isSafe ? "Your safe check-in is saved for your circle." : "Your support check-in is saved for your circle. It does not contact emergency services.";
        action.textContent = "Clear today's check-in";
        action.dataset.checkinAction = "reset";
        banner.classList.toggle("is-checked", isSafe);
        banner.classList.toggle("is-help", !isSafe);
        update.textContent = `${isSafe ? "Safe" : "Support"}, ${formatTime(checkin.created_at)}`;
        update.className = isSafe ? "state-dot" : "state-dot pending";
        pill.textContent = isSafe ? "Safe" : "Support";
        pill.className = isSafe ? "state-dot" : "state-dot pending";
      }
      renderMembers();
      renderActivity();
    };

    const renderActivity = () => {
      const rows = dashboard.activity.map((item) => `<div class="quick-row"><span><b>${item.status === "safe" ? "Safe check-in" : "Support check-in"}</b><small>${escapeHtml(formatDate(item.created_at))} · ${escapeHtml(formatTime(item.created_at))}</small></span><span class="state-dot ${item.status === "support" ? "pending" : ""}">${item.status === "safe" ? "Safe" : "Support"}</span></div>`);
      if (!rows.length) rows.push('<div class="empty-state">Your check-in activity will appear here.</div>');
      if (get("userActivityList")) get("userActivityList").innerHTML = rows.join("");
      if (get("userNotificationsList")) get("userNotificationsList").innerHTML = rows.join("");
    };

    const setReminderText = () => {
      const reminder = dashboard.reminder;
      get("scheduleSummary").textContent = reminder.enabled ? formatTime(`2000-01-01T${reminder.time}:00`) : "Paused";
      get("scheduleFoot").textContent = reminder.enabled ? "Preference saved to your account" : "Reminder preference paused";
      get("scheduleSaved").textContent = reminder.enabled ? `Preference saved for ${reminder.time}. Delivery is not configured.` : "Reminder preference paused for your account.";
    };

    const scheduleToggle = get("userScheduleEnabled");
    const scheduleTime = get("userScheduleTime");
    scheduleToggle.checked = dashboard.reminder.enabled;
    scheduleTime.value = dashboard.reminder.time;
    setReminderText();
    const saveReminder = async () => {
      scheduleToggle.disabled = true;
      scheduleTime.disabled = true;
      try {
        const saved = await api("/reminder", {
          method: "PUT",
          body: JSON.stringify({ enabled: scheduleToggle.checked, time: scheduleTime.value || "19:00" })
        });
        dashboard.reminder = saved.reminder;
        setReminderText();
      } catch (error) { showError(error); }
      finally { scheduleToggle.disabled = false; scheduleTime.disabled = false; }
    };
    scheduleToggle.addEventListener("change", saveReminder);
    scheduleTime.addEventListener("change", saveReminder);

    get("userCheckinAction").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        if (button.dataset.checkinAction === "reset") await api("/checkins/today", { method: "DELETE" });
        else await api("/checkins", { method: "POST", body: JSON.stringify({ status: "safe" }) });
        const fresh = await api("/dashboard");
        Object.assign(dashboard, fresh);
        renderCheckin();
      } catch (error) { showError(error); }
      finally { button.disabled = false; }
    });
    document.querySelectorAll("[data-request-support]").forEach((button) => button.addEventListener("click", () => get("supportConfirmDialog").showModal()));
    get("confirmUserSupport").addEventListener("click", async () => {
      const button = get("confirmUserSupport");
      button.disabled = true;
      try {
        await api("/checkins", { method: "POST", body: JSON.stringify({ status: "support" }) });
        Object.assign(dashboard, await api("/dashboard"));
        get("supportConfirmDialog").close();
        renderCheckin();
      } catch (error) { showError(error); }
      finally { button.disabled = false; }
    });
    document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => get("supportConfirmDialog").close()));
    get("supportConfirmDialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });

    get("inviteMemberForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector("button[type=submit]");
      const message = get("inviteMemberMessage");
      submit.disabled = true;
      try {
        const result = await api("/circle/invitations", {
          method: "POST",
          body: JSON.stringify({ full_name: get("inviteMemberName").value.trim(), email: get("inviteMemberEmail").value.trim() })
        });
        form.reset();
        showMessage(message, result.invitation.email_sent ? "Invitation email sent." : "Invitation created. Share this link with the invited person:");
        if (result.invitation.invite_url) {
          const link = document.createElement("a");
          link.href = result.invitation.invite_url;
          link.textContent = " Open invitation";
          message.append(link);
        }
        Object.assign(dashboard, await api("/dashboard"));
        renderMembers();
      } catch (error) { showMessage(message, error.message, true); }
      finally { submit.disabled = false; }
    });

    renderCheckin();
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