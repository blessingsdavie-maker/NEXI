(async () => {
  "use strict";

  const role = document.body.dataset.role;
  const themeKey = "nexi-demo-state";
  let userSession = null;
  if (role === "user") {
    try {
      const response = await window.nexiApi.request("/me");
      if (!response.ok) {
        window.location.replace("login.html?mode=login");
        return;
      }
      const data = await response.json();
      userSession = data.user;
    } catch {
      window.location.replace("login.html?mode=login");
      return;
    }
  }
  const userKey = role === "user" ? `nexi-user-dashboard:${encodeURIComponent(userSession.email.toLowerCase())}` : "nexi-user-dashboard";
  const adminKey = "nexi-admin-dashboard";
  const get = (id) => document.getElementById(id);
  const safeRead = (key, fallback) => {
    try {
      return { ...fallback, ...JSON.parse(localStorage.getItem(key) || "{}") };
    } catch {
      return { ...fallback };
    }
  };
  const safeWrite = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The prototype remains usable when local storage is unavailable.
    }
  };
  const themeState = safeRead(themeKey, { theme: null });
  const themeButton = get("portalTheme");

  const setTheme = (theme) => {
    if (theme === "dark") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    themeButton?.setAttribute("aria-label", theme === "dark" ? "Use light theme" : "Use dark theme");
  };
  setTheme(themeState.theme);
  themeButton?.addEventListener("click", () => {
    themeState.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    safeWrite(themeKey, themeState);
    setTheme(themeState.theme);
  });

  const sidebar = get("portalSidebar");
  const menuButton = get("portalMenu");
  menuButton?.addEventListener("click", () => {
    const open = sidebar.classList.toggle("is-open");
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute("aria-label", open ? "Close dashboard menu" : "Open dashboard menu");
  });

  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.viewTarget;
      document.querySelectorAll("[data-view-target]").forEach((item) => item.removeAttribute("aria-current"));
      button.setAttribute("aria-current", "page");
      document.querySelectorAll(".portal-view").forEach((view) => view.classList.toggle("is-active", view.id === target));
      if (sidebar) sidebar.classList.remove("is-open");
      menuButton?.setAttribute("aria-expanded", "false");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
  document.querySelectorAll("[data-open-view]").forEach((button) => {
    button.addEventListener("click", () => document.querySelector(`[data-view-target="${button.dataset.openView}"]`)?.click());
  });
  get("portalDate")?.replaceChildren(document.createTextNode(new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())));
  get("portalYear")?.replaceChildren(document.createTextNode(String(new Date().getFullYear())));
  document.querySelectorAll("[data-user-signout]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const response = await window.nexiApi.request("/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed");
      window.location.replace("login.html?mode=login");
    } catch {
      button.disabled = false;
      window.alert("Could not sign out. Check your connection and try again.");
    }
  }));

  if (role === "user") setupUser();
  if (role === "admin") setupAdmin();

  function setupUser() {
    const profileName = userSession.full_name?.trim() || "Nexi member";
    const profileInitials = profileName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
    get("userGreetingName").textContent = profileName.split(/\s+/)[0];
    get("userProfileName").textContent = profileName;
    get("userAvatar").textContent = profileInitials;
    get("userProfileDisplayName").textContent = profileName;
    get("userProfileEmail").textContent = userSession.email;
    get("userProfileAvatar").textContent = profileInitials;
    const seed = {
      checkin: null,
      scheduleEnabled: true,
      scheduleTime: "19:00",
      members: [
        { name: profileName, relation: "You", status: "You", initials: profileInitials, color: "coral", time: "Your account" },
        { name: "Mum", relation: "Family", status: "Safe", initials: "M", color: "gold", time: "Checked in at 6:42 PM" },
        { name: "Dad", relation: "Family", status: "Safe", initials: "D", color: "blue", time: "Checked in at 6:51 PM" },
        { name: "Brianna", relation: "Family", status: "Safe", initials: "B", color: "plum", time: "Checked in at 6:57 PM" },
        { name: "James", relation: "Family", status: "Safe", initials: "J", color: "teal", time: "Checked in at 6:59 PM" }
      ]
    };
    const state = safeRead(userKey, seed);
    if (!Array.isArray(state.members) || !state.members.length) state.members = seed.members;
    const checkinBanner = get("userCheckinBanner");
    const renderCheckin = () => {
      const text = get("userCheckinText");
      const action = get("userCheckinAction");
      const update = get("userMemberStatus");
      const updatePill = get("userMemberStatusDot");
      if (!state.checkin) {
        text.textContent = "A quick check-in lets your circle know you have arrived.";
        action.textContent = "I'm safe";
        action.dataset.checkinAction = "safe";
        checkinBanner.classList.remove("is-checked", "is-help");
        update.textContent = "Waiting for your update";
        update.className = "state-dot pending";
        updatePill.textContent = "Pending";
        updatePill.className = "state-dot pending";
      } else if (state.checkin.kind === "safe") {
        text.textContent = "You're checked in. Your circle has been updated.";
        action.textContent = "Update check-in";
        action.dataset.checkinAction = "reset";
        checkinBanner.classList.add("is-checked");
        checkinBanner.classList.remove("is-help");
        update.textContent = "Safe, just now";
        update.className = "state-dot";
        updatePill.textContent = "Safe";
        updatePill.className = "state-dot";
      } else {
        text.textContent = "Your support update is ready for the people you chose. This demo sends nothing.";
        action.textContent = "Reset demo";
        action.dataset.checkinAction = "reset";
        checkinBanner.classList.add("is-help");
        checkinBanner.classList.remove("is-checked");
        update.textContent = "Support update selected";
        update.className = "state-dot pending";
        updatePill.textContent = "Support";
        updatePill.className = "state-dot pending";
      }
      const checkedIn = state.members.filter((member) => member.status === "Safe").length + (state.checkin?.kind === "safe" ? 1 : 0);
      get("userCheckedCount").textContent = `${Math.min(checkedIn, state.members.length)} / ${state.members.length}`;
      safeWrite(userKey, state);
      renderMembers();
    };
    const renderMembers = () => {
      const list = get("userMemberList");
      const memberCount = state.members.length;
      get("userCircleMembersLabel").textContent = `${memberCount} people`;
      get("userCircleCount").textContent = String(memberCount);
      list.innerHTML = state.members.map((member, index) => {
        let status = member.status;
        let time = member.time;
        if (index === 0 && state.checkin?.kind === "safe") { status = "Safe"; time = "Checked in just now"; }
        if (index === 0 && state.checkin?.kind === "help") { status = "Support"; time = "Support update selected"; }
        const stateClass = status === "Safe" ? "state-dot" : status === "Support" || status === "Pending" ? "state-dot pending" : "state-dot offline";
        return `<div class="member-row"><div class="member-detail"><span class="member-avatar ${member.color || "teal"}">${escapeHtml(member.initials)}</span><span><b>${escapeHtml(member.name)}</b><small>${escapeHtml(time)}</small></span></div><span class="member-meta"><span class="state-dot ${stateClass.replace("state-dot", "").trim()}">${escapeHtml(status)}</span></span></div>`;
      }).join("");
    };
    const renderActivity = () => {
      const checkinText = !state.checkin
        ? "You have not checked in yet"
        : state.checkin.kind === "safe" ? "You checked in safe" : "You selected a support update";
      const checkinStatus = !state.checkin ? "Pending" : state.checkin.kind === "safe" ? "Safe" : "Support";
      const checkinClass = !state.checkin || state.checkin.kind === "help" ? "pending" : "";
      get("userActivityList").innerHTML = `<div class="quick-row"><span><b>Tonight's check-in</b><small>${escapeHtml(checkinText)}</small></span><span class="state-dot ${checkinClass}">${checkinStatus}</span></div><div class="quick-row"><span><b>Circle ready</b><small>${state.members.length} people are in your demo circle</small></span><span class="date-label">Today</span></div><div class="quick-row"><span><b>Location sharing</b><small>Location sharing is currently off</small></span><span class="state-dot">Private</span></div>`;
    };

    get("userCheckinAction").addEventListener("click", (event) => {
      if (event.currentTarget.dataset.checkinAction === "reset") {
        state.checkin = null;
        renderCheckin();
      } else {
        state.checkin = { kind: "safe", at: new Date().toISOString() };
        renderCheckin();
      }
    });
    document.querySelectorAll("[data-request-support]").forEach((button) => button.addEventListener("click", () => get("supportConfirmDialog").showModal()));
    get("confirmUserSupport").addEventListener("click", () => {
      state.checkin = { kind: "help", at: new Date().toISOString() };
      get("supportConfirmDialog").close();
      renderCheckin();
    });
    document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => get("supportConfirmDialog").close()));
    get("supportConfirmDialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });

    const scheduleToggle = get("userScheduleEnabled");
    const scheduleTime = get("userScheduleTime");
    scheduleToggle.checked = Boolean(state.scheduleEnabled);
    scheduleTime.value = state.scheduleTime || "19:00";
    const saveSchedule = () => {
      state.scheduleEnabled = scheduleToggle.checked;
      state.scheduleTime = scheduleTime.value || "19:00";
      safeWrite(userKey, state);
      get("scheduleSaved").textContent = state.scheduleEnabled ? `Reminder set for ${formatTime(state.scheduleTime)}. Saved on this device.` : "Check-in reminder paused on this device.";
      get("scheduleSummary").textContent = state.scheduleEnabled ? formatTime(state.scheduleTime) : "Paused";
      get("scheduleFoot").textContent = state.scheduleEnabled ? "Today · device reminder" : "Reminders are paused";
    };
    scheduleToggle.addEventListener("change", saveSchedule);
    scheduleTime.addEventListener("change", saveSchedule);
    get("scheduleSummary").textContent = state.scheduleEnabled ? formatTime(state.scheduleTime) : "Paused";
    get("scheduleFoot").textContent = state.scheduleEnabled ? "Today · device reminder" : "Reminders are paused";
    get("scheduleSaved").textContent = state.scheduleEnabled ? `Reminder set for ${formatTime(state.scheduleTime)}. Saved on this device.` : "Check-in reminder paused on this device.";

    get("inviteMemberForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const name = get("inviteMemberName").value.trim();
      const email = get("inviteMemberEmail").value.trim();
      const message = get("inviteMemberMessage");
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        message.textContent = "Add a name and valid email to create a demo invite.";
        message.classList.add("is-error");
        return;
      }
      if (state.members.length >= 8) {
        message.textContent = "This demo circle has reached its 8-person limit.";
        message.classList.add("is-error");
        return;
      }
      const colors = ["teal", "gold", "blue", "plum"];
      state.members.push({ name, relation: "Invited", status: "Pending", initials: name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), color: colors[state.members.length % colors.length], time: `Invite prepared for ${email}` });
      get("inviteMemberForm").reset();
      message.textContent = `Demo invite prepared for ${name}. Nothing was emailed.`;
      message.classList.remove("is-error");
      safeWrite(userKey, state);
      renderMembers();
      renderActivity();
    });
    renderCheckin();
  }

  function setupAdmin() {
    const seed = {
      members: [
        { name: "Amina Wanjiku", email: "amina@example.test", circle: "Kamau circle", joined: "Today", status: "Active" },
        { name: "Kamau Mwangi", email: "kamau@example.test", circle: "Kamau circle", joined: "Today", status: "Active" },
        { name: "Wanjiru Njeri", email: "wanjiru@example.test", circle: "Njeri circle", joined: "Yesterday", status: "Active" },
        { name: "Otieno family", email: "circle@example.test", circle: "Otieno circle", joined: "Yesterday", status: "Paused" },
        { name: "Leah Atieno", email: "leah@example.test", circle: "Atieno circle", joined: "Sep 25", status: "Active" }
      ],
      directory: [
        { name: "Community Health Centre", category: "Health", area: "Nairobi · Central", status: "Review" },
        { name: "Safe Steps Counselling", category: "Support", area: "Nairobi · West", status: "Verified" },
        { name: "Women’s Legal Aid Desk", category: "Safety", area: "Mombasa · Central", status: "Review" },
        { name: "Family Wellness Clinic", category: "Health", area: "Kisumu · Central", status: "Verified" }
      ]
    };
    const state = safeRead(adminKey, seed);
    if (!Array.isArray(state.members)) state.members = seed.members;
    if (!Array.isArray(state.directory)) state.directory = seed.directory;

    const renderMembers = () => {
      const query = get("adminMemberSearch").value.trim().toLowerCase();
      const filter = get("adminMemberFilter").value;
      const rows = state.members.filter((member) => {
        const matchesQuery = [member.name, member.email, member.circle].join(" ").toLowerCase().includes(query);
        return matchesQuery && (filter === "All" || member.status === filter);
      });
      get("adminMemberRows").innerHTML = rows.map((member) => {
        const originalIndex = state.members.indexOf(member);
        const paused = member.status === "Paused";
        return `<tr><td><div class="member-detail"><span class="member-avatar ${originalIndex % 2 ? "blue" : "teal"}">${escapeHtml(member.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase())}</span><span><b>${escapeHtml(member.name)}</b><small>${escapeHtml(member.email)}</small></span></div></td><td>${escapeHtml(member.circle)}</td><td>${escapeHtml(member.joined)}</td><td><span class="status-pill ${paused ? "paused" : ""}">${escapeHtml(member.status)}</span></td><td><div class="table-actions"><button class="button button-secondary button-small" type="button" data-member-index="${originalIndex}" data-member-action="${paused ? "activate" : "pause"}">${paused ? "Restore" : "Pause"}</button></div></td></tr>`;
      }).join("");
      get("adminMemberEmpty").hidden = rows.length > 0;
      get("adminActiveCount").textContent = String(state.members.filter((member) => member.status === "Active").length);
      get("adminCircleCount").textContent = String(new Set(state.members.map((member) => member.circle)).size);
      get("adminMemberRows").querySelectorAll("[data-member-action]").forEach((button) => button.addEventListener("click", () => {
        const member = state.members[Number(button.dataset.memberIndex)];
        member.status = button.dataset.memberAction === "pause" ? "Paused" : "Active";
        safeWrite(adminKey, state);
        renderMembers();
      }));
    };

    const renderDirectory = () => {
      get("adminDirectoryRows").innerHTML = state.directory.map((listing, index) => {
        const verified = listing.status === "Verified";
        return `<tr><td><b>${escapeHtml(listing.name)}</b></td><td>${escapeHtml(listing.category)}</td><td>${escapeHtml(listing.area)}</td><td><span class="status-pill ${verified ? "" : "review"}">${escapeHtml(listing.status)}</span></td><td><div class="table-actions"><button class="button ${verified ? "button-secondary" : "button-primary"} button-small" type="button" data-directory-index="${index}">${verified ? "Verified" : "Verify listing"}</button></div></td></tr>`;
      }).join("");
      get("adminReviewCount").textContent = String(state.directory.filter((listing) => listing.status === "Review").length);
      get("adminReviewCountLabel").textContent = get("adminReviewCount").textContent;
      get("adminReviewCountSummary").textContent = get("adminReviewCount").textContent;
      get("adminDirectoryRows").querySelectorAll("[data-directory-index]").forEach((button) => button.addEventListener("click", () => {
        const listing = state.directory[Number(button.dataset.directoryIndex)];
        listing.status = listing.status === "Verified" ? "Review" : "Verified";
        safeWrite(adminKey, state);
        renderDirectory();
      }));
    };

    get("adminMemberSearch").addEventListener("input", renderMembers);
    get("adminMemberFilter").addEventListener("change", renderMembers);
    document.querySelector("[data-focus-invite]").addEventListener("click", () => {
      get("adminInviteName").focus();
      get("adminInviteName").scrollIntoView({ behavior: "smooth", block: "center" });
    });
    get("adminInviteForm").addEventListener("submit", (event) => {
      event.preventDefault();
      const name = get("adminInviteName").value.trim();
      const email = get("adminInviteEmail").value.trim();
      const message = get("adminInviteMessage");
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        message.textContent = "Enter a name and valid email for the demo account.";
        message.classList.add("is-error");
        return;
      }
      state.members.push({ name, email, circle: "Unassigned", joined: "Just now", status: "Active" });
      get("adminInviteForm").reset();
      message.textContent = `Demo account for ${name} added locally. No email was sent.`;
      message.classList.remove("is-error");
      safeWrite(adminKey, state);
      renderMembers();
    });

    const csvButton = get("adminExport");
    csvButton.addEventListener("click", () => {
      const header = ["Circle", "Status", "Time"];
      const data = [["Kamau circle", "4 / 5 checked in", "7:00 PM"], ["Njeri circle", "3 / 3 checked in", "6:45 PM"], ["Atieno circle", "2 / 4 checked in", "6:30 PM"]];
      const csv = [header, ...data].map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n");
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      link.download = "nexi-demo-check-in-summary.csv";
      link.click();
      URL.revokeObjectURL(link.href);
    });

    renderMembers();
    renderDirectory();
  }

  function formatTime(time) {
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }
})();