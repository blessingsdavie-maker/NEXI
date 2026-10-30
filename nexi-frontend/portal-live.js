(async () => {

  "use strict";



  const get = (id) => document.getElementById(id);

  const role = document.body.dataset.role;

  const api = async (path, options = {}) => {

    const response = await window.nalsafeApi.request(path, {

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

    const hasAdminAccess = ["admin", "support_admin"].includes(userSession.role);

    if ((role === "admin") !== hasAdminAccess) {

      window.location.replace(hasAdminAccess ? "admin-dashboard.html" : "user-dashboard.html");

      return;

    }

  } catch {

    window.location.replace("login.html?mode=login");

    return;

  }



  const themeKey = "nalsafe-theme";

  const legacyThemeKey = "nexi-theme";

  const themeButton = get("portalTheme");

  let theme = localStorage.getItem(themeKey) || localStorage.getItem(legacyThemeKey);

  if (!localStorage.getItem(themeKey) && theme) {

    localStorage.setItem(themeKey, theme);

    localStorage.removeItem(legacyThemeKey);

  }

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

  const layout = sidebar?.closest(".portal-layout");
  const mobileMenuQuery = window.matchMedia("(max-width: 700px)");
  const isMenuOpen = () => mobileMenuQuery.matches
    ? Boolean(sidebar?.classList.contains("is-open"))
    : Boolean(layout && !layout.classList.contains("is-sidebar-collapsed"));
  const syncMenuState = () => {
    const open = isMenuOpen();
    menuButton?.setAttribute("aria-expanded", String(open));
    menuButton?.setAttribute("aria-label", open ? "Close dashboard menu" : "Open dashboard menu");
  };

  syncMenuState();

  mobileMenuQuery.addEventListener("change", () => {
    sidebar?.classList.remove("is-open");
    layout?.classList.remove("is-sidebar-collapsed");
    syncMenuState();
  });

  menuButton?.addEventListener("click", () => {

    if (!sidebar || !layout) return;
    if (mobileMenuQuery.matches) {
      sidebar.classList.toggle("is-open");
    } else {
      layout.classList.toggle("is-sidebar-collapsed");
    }
    syncMenuState();

  });

  document.querySelectorAll("[data-view-target]").forEach((button) => button.addEventListener("click", () => {

    const target = button.dataset.viewTarget;

    document.querySelectorAll("[data-view-target]").forEach((item) => item.removeAttribute("aria-current"));

    button.setAttribute("aria-current", "page");

    document.querySelectorAll(".portal-view").forEach((view) => view.classList.toggle("is-active", view.id === target));

    sidebar?.classList.remove("is-open");

    syncMenuState();

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

      window.nalsafeApi.clearToken();

      window.location.replace("login.html?mode=login");

    } catch (error) {

      button.disabled = false;

      showError(error);

    }

  }));



  if (role === "user") await setupUser();

  if (role === "admin") await setupAdmin();



  async function setupUser() {

  const profileName = String(userSession.full_name || "NALSAFE member").trim();

  const greeting = get("userGreeting");
  const localHour = new Date().getHours();
  const timeOfDay = localHour >= 5 && localHour < 12
    ? "morning"
    : localHour >= 12 && localHour < 17
      ? "afternoon"
      : "evening";
  greeting?.setAttribute("data-time-of-day", timeOfDay);
  get("userGreetingText").textContent = `Good ${timeOfDay},`;

  if (greeting && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.requestAnimationFrame(() => greeting.classList.add("greeting-arrive"));
  }



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

  get("userAvatarInitials").textContent = initials;

  get("userProfileDisplayName").textContent = profileName;

  get("userProfileEmail").textContent = userSession.email || "Email unavailable";

  get("profileAccountEmail").textContent = userSession.email || "Email unavailable";

  get("userProfileAvatarInitials").textContent = initials;



  const avatarImageIds = ["userAvatarImage", "userProfileAvatarImage"];

  const photoMessage = get("profilePhotoMessage");

  const photoInput = get("profilePhotoInput");

  const photoButton = get("profilePhotoButton");

  const removePhotoButton = get("removeProfilePhotoButton");

  let avatarUrl = null;

  const updateAvatarDisplay = (value) => {

    avatarUrl = typeof value === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)

      ? value

      : null;

    avatarImageIds.forEach((id) => {

      const image = get(id);

      if (!image) return;

      image.hidden = !avatarUrl;

      if (avatarUrl) image.src = avatarUrl;

      else image.removeAttribute("src");

    });

    photoButton.textContent = avatarUrl ? "Change photo" : "Add profile photo";

    removePhotoButton.hidden = !avatarUrl;

  };



  api("/users/profile")
    .then((profile) => updateAvatarDisplay(profile.user?.avatar_url))
    .catch((error) => {
      showMessage(photoMessage, `Your saved profile photo could not be loaded. ${error.message}`, true);
    });



  photoButton.addEventListener("click", () => photoInput.click());

  photoInput.addEventListener("change", async () => {

    const file = photoInput.files?.[0];

    if (!file) return;

    photoInput.value = "";



    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {

      showMessage(photoMessage, "Choose a JPEG, PNG, or WebP image smaller than 10 MB.", true);

      return;

    }



    photoButton.disabled = true;

    removePhotoButton.disabled = true;

    showMessage(photoMessage, "Saving your profile photo…");

    let imageUrl;

    try {

      imageUrl = URL.createObjectURL(file);

      const image = new Image();

      image.src = imageUrl;

      await image.decode();



      const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));

      const canvas = document.createElement("canvas");

      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));

      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);



      let blob;

      for (const quality of [0.85, 0.75, 0.65, 0.55]) {

        blob = await new Promise((resolve, reject) => {

          canvas.toBlob((result) => result ? resolve(result) : reject(new Error("This photo could not be processed.")), "image/jpeg", quality);

        });

        if (blob.size <= 450000) break;

      }

      if (blob.size > 450000) throw new Error("This photo is too large to save. Choose a smaller image.");



      const reader = new FileReader();

      const photoData = await new Promise((resolve, reject) => {

        reader.onload = () => resolve(reader.result);

        reader.onerror = () => reject(new Error("This photo could not be read."));

        reader.readAsDataURL(blob);

      });

      await api("/users/profile/avatar", {

        method: "PUT",

        body: JSON.stringify({ avatar_url: photoData })

      });

      updateAvatarDisplay(photoData);

      showMessage(photoMessage, "Your profile photo has been updated.");

    } catch (error) {

      showMessage(photoMessage, error.message || "Your profile photo could not be saved.", true);

    } finally {

      if (imageUrl) URL.revokeObjectURL(imageUrl);

      photoButton.disabled = false;

      removePhotoButton.disabled = false;

    }

  });



  removePhotoButton.addEventListener("click", async () => {

    removePhotoButton.disabled = true;

    photoButton.disabled = true;

    try {

      const result = await api("/users/profile/avatar", {

        method: "PUT",

        body: JSON.stringify({ avatar_url: null })

      });

      updateAvatarDisplay(null);

      showMessage(photoMessage, result.message || "Your profile photo has been removed.");

    } catch (error) {

      showMessage(photoMessage, error.message, true);

    } finally {

      removePhotoButton.disabled = !avatarUrl;

      photoButton.disabled = false;

    }

  });



  get("emailChangeForm")?.addEventListener("submit", async (event) => {

    event.preventDefault();

    const form = event.currentTarget;

    const submit = get("emailChangeSubmit");

    const message = get("emailChangeMessage");

    submit.disabled = true;



    try {

      const result = await api("/users/email", {

        method: "PUT",

        body: JSON.stringify({

          email: get("newAccountEmail").value.trim().toLowerCase(),

          current_password: get("emailCurrentPassword").value

        })

      });



      userSession.email = result.user.email;

      get("userProfileEmail").textContent = userSession.email;

      get("profileAccountEmail").textContent = userSession.email;

      form.reset();

      showMessage(message, result.message || "Your email address has been updated.");

    } catch (error) {

      showMessage(message, error.message, true);

    } finally {

      submit.disabled = false;

    }

  });



  let dashboard = {

    members: [],

    checkins: [],

    activity: [],

    reminder: {

      enabled: false,

      time: "19:00"

    }

  };

  let dashboardRevision = 0;


  // Pull accepted member-to-member connections into the existing dashboard
  // member list, without changing the existing check-in / invitation API.
  let socialConnections = [];
  const mergeSocialConnections = async () => {
    try {
      const result = await api("/social/connections");
      socialConnections = Array.isArray(result.connections) ? result.connections : [];
    } catch (error) {
      console.warn("NALSAFE social connections are temporarily unavailable:", error.message);
      return;
    }

    const existingMembers = Array.isArray(dashboard.members)
      ? dashboard.members.filter((member) => !member?.social_connection)
      : [];
    const idOf = (member) => String(member?.member_user_id ?? member?.user_id ?? member?.id ?? "");
    const knownIds = new Set(existingMembers.map(idOf).filter(Boolean));

    socialConnections.forEach((connection) => {
      const id = String(connection.id ?? connection.user_id ?? "");
      if (!id || id === String(userSession.id) || knownIds.has(id)) return;
      existingMembers.push({
        user_id: id,
        full_name: connection.full_name || connection.username || "NALSAFE member",
        username: connection.username || "",
        status: "member",
        social_connection: true
      });
      knownIds.add(id);
    });

    dashboard.members = existingMembers;
  };

  const initialDashboardRevision = dashboardRevision;
  api("/dashboard")
    .then(async (initialDashboard) => {
      if (initialDashboardRevision !== dashboardRevision) return;
      dashboard = initialDashboard;
      await mergeSocialConnections();
      if (initialDashboardRevision !== dashboardRevision) return;
      renderMembers();
      renderCheckin();
      renderActivity();
      setReminderText();
    })
    .catch(() => {
      showError(new Error("Your dashboard data is temporarily unavailable. Some details may be limited until the service is back."));
    });

  const NOTIFICATION_READ_KEY =

    `nalsafe-read-notifications-${userSession.id}`;

  const legacyNotificationReadKey =

    `nexi-read-notifications-${userSession.id}`;

  const legacyNotificationReads = localStorage.getItem(legacyNotificationReadKey);

  if (!localStorage.getItem(NOTIFICATION_READ_KEY) && legacyNotificationReads) {

    localStorage.setItem(NOTIFICATION_READ_KEY, legacyNotificationReads);

  }

  localStorage.removeItem(legacyNotificationReadKey);



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

    let indicator = get("nalsafeConnectionState");



    if (!indicator) {

      indicator = document.createElement("span");

      indicator.id = "nalsafeConnectionState";

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

    let button = get("dashboardRefreshButton");

    if (!button) {
      const heading = document.querySelector("#userOverview .view-heading");
      if (!heading) return;

      button = document.createElement("button");
      button.id = "dashboardRefreshButton";
      button.type = "button";
      button.className = "button button-secondary button-small";
      button.textContent = "↻ Refresh";
      button.setAttribute("aria-label", "Refresh dashboard");
      heading.append(button);
    }

    if (button.dataset.refreshHandlerBound) return;
    button.dataset.refreshHandlerBound = "true";



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

          "Your check-in activity has been saved to your NALSAFE account.",

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

      get("scheduleSaved").classList.remove("is-error");

    }

  };

  const syncReminderControls = () => {
    const reminder = dashboard.reminder || { enabled: false, time: "19:00" };
    const toggle = get("userScheduleEnabled");
    const time = get("userScheduleTime");

    if (toggle && document.activeElement !== toggle) {
      toggle.checked = Boolean(reminder.enabled);
    }
    if (time && document.activeElement !== time) {
      time.value = reminder.time || "19:00";
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

      new Notification("NALSAFE", {

        body: message,

        icon: "favicon.ico"

      });

    } catch {

      // Browser notification failed silently.

    }

  };



  const refreshDashboard = async ({

    notify = false,
    silent = false

  } = {}) => {

    const previousActivityLength = activity().length;

    const revision = ++dashboardRevision;

    try {

      const refreshedDashboard = await api("/dashboard");
      if (revision !== dashboardRevision) return true;
      dashboard = refreshedDashboard;
      await mergeSocialConnections();
      if (revision !== dashboardRevision) return true;

      renderMembers();

      renderCheckin();

      renderActivity();

      setReminderText();
      syncReminderControls();



      renderConnectionState();



      if (

        notify &&

        activity().length > previousActivityLength

      ) {

        maybeNotify("Your NALSAFE dashboard has a new update.");

      }

      return true;

    } catch (error) {

      renderConnectionState();
      if (!silent) {
        showError(new Error("The dashboard is temporarily unavailable. Your latest saved view remains open."));
      }
      return false;

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

    "nalsafe:auth-expired",

    () => {

      window.nalsafeApi.clearToken();

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
      const previousReminder = { ...dashboard.reminder };

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
        syncReminderControls();



        const permission =

          await requestBrowserNotificationPermission();



        if (permission === "granted") {

          maybeNotify(

            "Your NALSAFE reminder preference was updated."

          );

        }

      } catch (error) {

        dashboard.reminder = previousReminder;
        scheduleToggle.checked = Boolean(previousReminder.enabled);
        scheduleTime.value = previousReminder.time || "19:00";
        setReminderText();
        showMessage(get("scheduleSaved"), error.message, true);
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

  const submitCheckin = async (status, feedback) => {
    showMessage(feedback, status === "clear" ? "Clearing today's check-in…" : "Saving your check-in…");

    try {
      const result = status === "clear"
        ? await api("/checkins/today", { method: "DELETE" })
        : await api("/checkins", {
          method: "POST",
          body: JSON.stringify({ status })
        });

      if (status === "clear") {
        dashboard.checkins = dashboard.checkins.filter((item) =>
          String(item.user_id) !== String(userSession.id) || !isToday(item.created_at)
        );
        dashboard.activity = dashboard.activity.filter((item) =>
          String(item.user_id) !== String(userSession.id) || !isToday(item.created_at)
        );
      } else if (result.checkin) {
        dashboard.checkins = [...dashboard.checkins, result.checkin];
        dashboard.activity = [...dashboard.activity, result.checkin];
      }

      renderMembers();
      renderCheckin();
      renderActivity();

      const refreshed = await refreshDashboard({ silent: true });
      const message = result.message || (status === "clear"
        ? "Today's check-in was cleared."
        : "Your check-in has been saved.");
      const confirmation = refreshed
        ? message
        : `${message} Your dashboard could not refresh, but your response was saved.`;

      showMessage(feedback, confirmation);
      if (feedback !== get("userCheckinMessage")) {
        showMessage(get("userCheckinMessage"), confirmation);
      }

      if (status !== "clear") maybeNotify(message);
      return true;
    } catch (error) {
      showMessage(feedback, error.message, true);
      if (feedback !== get("userCheckinMessage")) {
        showMessage(get("userCheckinMessage"), error.message, true);
      }
      return false;
    }
  };

  const checkinButton =

    get("userCheckinAction");



  if (checkinButton) {

    checkinButton.addEventListener(

      "click",

      async (event) => {

          const button =

            event.currentTarget;

          const action = button.dataset.checkinAction;
          const previousLabel = button.textContent;

          button.disabled = true;
          button.setAttribute("aria-busy", "true");
          button.textContent = action === "reset" ? "Clearing…" : "Saving…";

          const succeeded = await submitCheckin(
            action === "reset" ? "clear" : "safe",
            get("userCheckinMessage")
          );

          if (!succeeded) button.textContent = previousLabel;
          button.removeAttribute("aria-busy");
          button.disabled = false;
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
          supportButton.setAttribute("aria-busy", "true");
          supportButton.textContent = "Saving…";

          const succeeded = await submitCheckin(
            "support",
            get("supportCheckinMessage")
          );

          if (succeeded) get("supportConfirmDialog")?.close();
          supportButton.textContent = "Save support check-in";
          supportButton.removeAttribute("aria-busy");
          supportButton.disabled = false;
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

    const list = get("userNotificationsList");
    if (!list) return;

    let button = get("markAllNotificationsRead");
    if (!button) {
      const panel = list.closest(".panel");
      const heading = panel?.querySelector(".panel-heading");
      if (!heading) return;

      button = document.createElement("button");
      button.id = "markAllNotificationsRead";
      button.type = "button";
      button.className = "button button-secondary button-small";
      button.textContent = "Mark all as read";
      heading.append(button);
    }

    if (button.dataset.markAllReadHandlerBound) return;
    button.dataset.markAllReadHandlerBound = "true";



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

   * This gives NALSAFE a near-live experience without

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
  syncReminderControls();

  renderConnectionState();

  setupSocialWidget({
    mergeSocialConnections,
    renderMembers,
    refreshDashboard,
    memberInitials,
    getSocialConnections: () => socialConnections
  });
}


  function setupSocialWidget({
    mergeSocialConnections,
    renderMembers,
    refreshDashboard,
    memberInitials,
    getSocialConnections
  }) {
    const toggle = get("socialChatToggle");
    const panel = get("socialChatPanel");
    if (!toggle || !panel) return;

    let activeTab = "people";
    let activeRecipient = null;
    let ownSocialProfile = null;
    let conversationCache = [];
    let invitationCache = [];
    let searchCache = [];
    let socialRefreshTimer = null;

    const socialStatus = (id, text, error = false) => {
      const el = get(id);
      if (!el) return;
      el.textContent = text || "";
      el.classList.toggle("is-error", Boolean(error));
    };

    const socialButton = (label, attrs = "", className = "button button-secondary button-small") =>
      `<button type="button" class="${className}" ${attrs}>${escapeHtml(label)}</button>`;

    const socialPerson = (person) => ({
      id: String(person.id ?? person.user_id ?? ""),
      full_name: String(person.full_name || person.name || "NALSAFE member"),
      username: String(person.username || "")
    });

    const activeConnection = (id) => getSocialConnections().some((person) => String(person.id) === String(id));

    const setSocialTab = (tab) => {
      activeTab = tab;
      document.querySelectorAll("[data-social-tab]").forEach((button) => {
        const selected = button.dataset.socialTab === tab;
        button.setAttribute("aria-selected", String(selected));
        button.classList.toggle("is-active", selected);
      });
      get("socialPeopleView").hidden = tab !== "people";
      get("socialMessagesView").hidden = tab !== "messages";
      get("socialInvitationsView").hidden = tab !== "invitations";
      if (tab === "messages") {
        get("socialConversationList").hidden = Boolean(activeRecipient);
        get("socialThread").hidden = !activeRecipient;
      }
      if (tab === "invitations") loadSocialInvitations().catch((error) => socialStatus("socialInvitationsStatus", error.message, true));
      if (tab === "messages") loadSocialConversations().catch((error) => socialStatus("socialConversationsStatus", error.message, true));
      if (tab === "people") loadSocialProfile().catch((error) => socialStatus("socialUsernameStatus", error.message, true));
    };

    const refreshSocialBadge = () => {
      const incoming = invitationCache.filter((item) => item.direction === "received" && item.status === "pending").length;
      const unread = conversationCache.reduce((total, item) => total + Number(item.unread_count || 0), 0);
      const count = incoming + unread;
      const badge = get("socialChatBadge");
      badge.hidden = count <= 0;
      badge.textContent = count > 99 ? "99+" : String(count);
      toggle.setAttribute("aria-label", count ? `Open chat and invitations, ${count} unread updates` : "Open chat and invitations");
    };

    const loadSocialProfile = async () => {
      const result = await api("/social/profile");
      ownSocialProfile = result.user || null;
      const input = get("socialOwnUsername");
      if (input && ownSocialProfile) input.value = ownSocialProfile.username || "";
      const label = get("socialOwnUsernameLabel");
      if (label) label.textContent = ownSocialProfile?.username ? `@${ownSocialProfile.username}` : "Not set yet";
      const hint = get("socialUsernameHint");
      if (hint) hint.textContent = ownSocialProfile?.username
        ? "People can find you with this username."
        : "Choose a unique username so people can find and invite you.";
    };

    get("socialUsernameForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button[type=submit]");
      const username = get("socialOwnUsername").value.trim().replace(/^@/, "");
      button.disabled = true;
      socialStatus("socialUsernameStatus", "Saving username…");
      try {
        const result = await api("/social/username", {
          method: "PUT",
          body: JSON.stringify({ username })
        });
        ownSocialProfile = result.user || ownSocialProfile;
        get("socialOwnUsernameLabel").textContent = `@${ownSocialProfile.username}`;
        socialStatus("socialUsernameStatus", result.message || "Username saved.");
        get("socialUsernameHint").textContent = "People can find you with this username.";
      } catch (error) {
        socialStatus("socialUsernameStatus", error.message, true);
      } finally {
        button.disabled = false;
      }
    });

    const renderSearchResults = (people) => {
      const target = get("socialSearchResults");
      if (!people.length) {
        target.innerHTML = `<div class="social-empty">No registered member was found with that username. Check the spelling and try again.</div>`;
        return;
      }
      target.innerHTML = people.map((rawPerson) => {
        const person = socialPerson(rawPerson);
        const connected = activeConnection(person.id);
        const messageButton = socialButton(
          "Message",
          `data-social-action="message" data-user-id="${escapeHtml(person.id)}" data-user-name="${escapeHtml(person.full_name)}" data-user-username="${escapeHtml(person.username)}" ${connected ? "" : "disabled title=\"Accept the circle invitation first\""}`
        );
        const inviteButton = connected
          ? `<span class="social-state-label">Already connected</span>`
          : socialButton(
              "Invite to circle",
              `data-social-action="invite" data-username="${escapeHtml(person.username)}"`
            );
        return `<article class="social-person-row">
          <span class="social-avatar" aria-hidden="true">${escapeHtml(memberInitials(person.full_name))}</span>
          <span class="social-person-copy"><b>${escapeHtml(person.full_name)}</b><small>@${escapeHtml(person.username)}</small></span>
          <span class="social-person-actions">${inviteButton}${messageButton}</span>
        </article>`;
      }).join("");
    };

    get("socialSearchForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const username = get("socialSearchUsername").value.trim().replace(/^@/, "");
      if (!username) return;
      const button = event.currentTarget.querySelector("button[type=submit]");
      button.disabled = true;
      socialStatus("socialSearchStatus", "Looking for that username…");
      get("socialSearchResults").innerHTML = "";
      try {
        const result = await api(`/social/search?username=${encodeURIComponent(username)}`);
        searchCache = Array.isArray(result.users) ? result.users : [];
        renderSearchResults(searchCache);
        socialStatus("socialSearchStatus", searchCache.length ? "Member found" : "No match found");
      } catch (error) {
        socialStatus("socialSearchStatus", error.message, true);
      } finally {
        button.disabled = false;
      }
    });

    const loadSocialConnectionsAndDashboard = async () => {
      await mergeSocialConnections();
      renderMembers();
      const refresh = get("dashboardRefreshButton");
      if (refresh) {
        try { await refreshDashboard({ notify: false }); } catch (_) { /* keep the social action usable */ }
      }
      // Refresh search-result action labels after an invite is accepted.
      if (searchCache.length) renderSearchResults(searchCache);
    };

    const loadSocialInvitations = async () => {
      const result = await api("/social/invitations");
      invitationCache = Array.isArray(result.invitations) ? result.invitations : [];
      const target = get("socialInvitationList");
      const rows = invitationCache.map((item) => {
        const incoming = item.direction === "received";
        const pending = item.status === "pending";
        const direction = incoming ? "Invited you" : "You invited";
        const statusLabel = item.status.charAt(0).toUpperCase() + item.status.slice(1);
        const actions = incoming && pending
          ? `<span class="social-person-actions">${socialButton("Accept", `data-social-action="respond" data-invitation-id="${escapeHtml(item.id)}" data-response="accept"`, "button button-primary button-small")}${socialButton("Decline", `data-social-action="respond" data-invitation-id="${escapeHtml(item.id)}" data-response="decline"`)}</span>`
          : `<span class="social-state-label ${pending ? "is-pending" : ""}">${escapeHtml(statusLabel)}</span>`;
        return `<article class="social-invitation-row"><span class="social-avatar" aria-hidden="true">${escapeHtml(memberInitials(item.other_name))}</span><span class="social-person-copy"><b>${escapeHtml(item.other_name || "NALSAFE member")}</b><small>${escapeHtml(direction)} · @${escapeHtml(item.other_username || "member")}</small><small>${pending ? `Expires ${escapeHtml(formatDate(item.expires_at))}` : escapeHtml(statusLabel)}</small></span>${actions}</article>`;
      });
      target.innerHTML = rows.length ? rows.join("") : `<div class="social-empty">No member invitations yet. Search for a username or invite someone new by email.</div>`;
      socialStatus("socialInvitationsStatus", "");
      refreshSocialBadge();
    };

    const renderSocialConversations = () => {
      const target = get("socialConversationList");
      if (!conversationCache.length) {
        target.innerHTML = `<div class="social-empty">No chats yet. Find a username and invite that member to your circle. Once they accept, you can message each other.</div>`;
      } else {
        target.innerHTML = conversationCache.map((item) => {
          const name = item.full_name || item.username || "NALSAFE member";
          const preview = item.last_message || "You are connected. Say hello.";
          const unread = Number(item.unread_count || 0);
          return `<button type="button" class="social-conversation-row" data-social-action="open-chat" data-user-id="${escapeHtml(item.user_id)}" data-user-name="${escapeHtml(name)}" data-user-username="${escapeHtml(item.username || "")}">
            <span class="social-avatar" aria-hidden="true">${escapeHtml(memberInitials(name))}</span>
            <span class="social-person-copy"><b>${escapeHtml(name)}</b><small>${escapeHtml(preview)}</small></span>
            ${unread ? `<span class="social-unread-count">${unread > 99 ? "99+" : unread}</span>` : ""}
          </button>`;
        }).join("");
      }
      refreshSocialBadge();
    };

    const loadSocialConversations = async () => {
      const result = await api("/social/conversations");
      conversationCache = Array.isArray(result.conversations) ? result.conversations : [];
      renderSocialConversations();
      socialStatus("socialConversationsStatus", "");
      if (activeRecipient) {
        const fresh = conversationCache.find((item) => String(item.user_id) === String(activeRecipient.id));
        if (fresh) activeRecipient = { ...activeRecipient, ...socialPerson({ ...fresh, id: fresh.user_id }) };
      }
    };

    const renderSocialThread = (messages) => {
      const target = get("socialMessagesList");
      if (!messages.length) {
        target.innerHTML = `<div class="social-empty">You are connected. Send the first message.</div>`;
        return;
      }
      target.innerHTML = messages.map((message) => {
        const own = String(message.sender_id) === String(userSession.id);
        const time = message.created_at ? formatTime(message.created_at) : "";
        return `<div class="social-message-line ${own ? "is-own" : "is-other"}"><div class="social-message-bubble">${escapeHtml(message.body)}<small>${escapeHtml(time)}</small></div></div>`;
      }).join("");
      target.scrollTop = target.scrollHeight;
    };

    const loadSocialThread = async () => {
      if (!activeRecipient) return;
      const result = await api(`/social/messages/${encodeURIComponent(activeRecipient.id)}`);
      renderSocialThread(Array.isArray(result.messages) ? result.messages : []);
      await loadSocialConversations();
    };

    const openSocialChat = async (person) => {
      activeRecipient = socialPerson(person);
      if (!activeRecipient.id) return;
      setSocialTab("messages");
      get("socialConversationList").hidden = true;
      get("socialThread").hidden = false;
      get("socialThreadName").textContent = activeRecipient.full_name;
      get("socialThreadUsername").textContent = activeRecipient.username ? `@${activeRecipient.username}` : "NALSAFE member";
      get("socialMessageInput").focus();
      socialStatus("socialConversationsStatus", "Loading conversation…");
      try {
        await loadSocialThread();
        socialStatus("socialConversationsStatus", "");
      } catch (error) {
        socialStatus("socialConversationsStatus", error.message, true);
      }
    };

    get("socialThreadBack")?.addEventListener("click", () => {
      activeRecipient = null;
      get("socialThread").hidden = true;
      get("socialConversationList").hidden = false;
      loadSocialConversations().catch((error) => socialStatus("socialConversationsStatus", error.message, true));
    });

    get("socialMessagesForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!activeRecipient) return;
      const input = get("socialMessageInput");
      const submit = event.currentTarget.querySelector("button[type=submit]");
      const body = input.value.trim();
      if (!body) return;
      submit.disabled = true;
      try {
        await api("/social/messages", {
          method: "POST",
          body: JSON.stringify({ recipient_id: activeRecipient.id, body })
        });
        input.value = "";
        await loadSocialThread();
        socialStatus("socialMessageStatus", "");
      } catch (error) {
        socialStatus("socialMessageStatus", error.message, true);
      } finally {
        submit.disabled = false;
        input.focus();
      }
    });

    get("socialConversationList")?.addEventListener("click", (event) => {
      const button = event.target.closest('[data-social-action="open-chat"]');
      if (!button) return;
      openSocialChat({
        id: button.dataset.userId,
        full_name: button.dataset.userName,
        username: button.dataset.userUsername
      });
    });

    const externalInviteForm = get("socialExternalInviteForm");
    externalInviteForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      get("socialExternalInviteResult").innerHTML = "";
      socialStatus("socialExternalInviteStatus", "Creating invitation…");
      try {
        const result = await api("/circle/invitations", {
          method: "POST",
          body: JSON.stringify({
            full_name: get("socialExternalInviteName").value.trim(),
            email: get("socialExternalInviteEmail").value.trim()
          })
        });
        const invite = result.invitation || {};
        form.reset();
        socialStatus("socialExternalInviteStatus", invite.email_sent
          ? "Invitation email sent successfully."
          : "Invitation created. Copy or share the link below.");
        if (invite.invite_url) {
          const wrapper = document.createElement("div");
          wrapper.className = "social-share-actions";
          const link = document.createElement("a");
          link.href = invite.invite_url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Open invitation link";
          const copy = document.createElement("button");
          copy.type = "button";
          copy.className = "button button-secondary button-small";
          copy.textContent = "Copy link";
          copy.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(invite.invite_url);
              copy.textContent = "Copied";
            } catch {
              socialStatus("socialExternalInviteStatus", "Clipboard access failed. Open the link and copy it from the address bar.", true);
            }
          });
          const whatsapp = document.createElement("a");
          whatsapp.className = "button button-secondary button-small";
          whatsapp.href = `https://wa.me/?text=${encodeURIComponent(`Join my NALSAFE circle: ${invite.invite_url}`)}`;
          whatsapp.target = "_blank";
          whatsapp.rel = "noopener noreferrer";
          whatsapp.textContent = "Share on WhatsApp";
          wrapper.append(link, copy, whatsapp);
          get("socialExternalInviteResult").replaceChildren(wrapper);
        }
        await loadSocialInvitations().catch(() => {});
      } catch (error) {
        socialStatus("socialExternalInviteStatus", error.message, true);
      } finally {
        button.disabled = false;
      }
    });

    panel.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-social-action]");
      if (!button || button.disabled) return;
      const action = button.dataset.socialAction;
      button.disabled = true;
      try {
        if (action === "invite") {
          const result = await api("/social/invitations", {
            method: "POST",
            body: JSON.stringify({ username: button.dataset.username })
          });
          socialStatus("socialSearchStatus", result.message || "Invitation sent.");
          await loadSocialInvitations();
        } else if (action === "message") {
          await openSocialChat({
            id: button.dataset.userId,
            full_name: button.dataset.userName,
            username: button.dataset.userUsername
          });
        } else if (action === "respond") {
          const result = await api(`/social/invitations/${encodeURIComponent(button.dataset.invitationId)}`, {
            method: "PATCH",
            body: JSON.stringify({ action: button.dataset.response })
          });
          socialStatus("socialInvitationsStatus", result.message || "Invitation updated.");
          await loadSocialConnectionsAndDashboard();
          await loadSocialInvitations();
          await loadSocialConversations();
        }
      } catch (error) {
        const place = activeTab === "invitations" ? "socialInvitationsStatus" : "socialSearchStatus";
        socialStatus(place, error.message, true);
      } finally {
        button.disabled = false;
        if (searchCache.length) renderSearchResults(searchCache);
      }
    });

    document.querySelectorAll("[data-social-tab]").forEach((button) => {
      button.addEventListener("click", () => setSocialTab(button.dataset.socialTab));
    });

    toggle.addEventListener("click", async () => {
      const opening = panel.hidden;
      panel.hidden = !opening;
      toggle.setAttribute("aria-expanded", String(opening));
      if (opening) {
        await Promise.allSettled([loadSocialProfile(), loadSocialInvitations(), loadSocialConversations()]);
      }
    });
    get("socialChatClose")?.addEventListener("click", () => {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.focus();
    });

    // Keep incoming invitations and unread counts current while the dashboard is open.
    const refreshSocial = async () => {
      if (document.hidden || !navigator.onLine) return;
      try {
        await mergeSocialConnections();
        renderMembers();
        if (searchCache.length) renderSearchResults(searchCache);
        await Promise.all([loadSocialInvitations(), loadSocialConversations()]);
        if (activeRecipient && activeTab === "messages" && !get("socialThread").hidden) {
          await loadSocialThread();
        }
      } catch (error) {
        console.warn("NALSAFE chat refresh failed:", error.message);
      }
    };
    socialRefreshTimer = window.setInterval(refreshSocial, 10000);
    window.addEventListener("beforeunload", () => {
      if (socialRefreshTimer) window.clearInterval(socialRefreshTimer);
    }, { once: true });

    // These are useful immediately after the widget becomes visible.
    loadSocialProfile().catch((error) => socialStatus("socialUsernameStatus", error.message, true));
    loadSocialInvitations().catch((error) => socialStatus("socialInvitationsStatus", error.message, true));
    loadSocialConversations().catch((error) => socialStatus("socialConversationsStatus", error.message, true));
  }


  async function setupAdmin() {

    const memberRows = get("adminMemberRows");

    const canManageFullAdmin = userSession.role === "admin";

    const canManageAdmins = Boolean(userSession.is_super_admin);

    get("adminProfileRole").textContent = canManageAdmins

      ? "Super administrator"

      : canManageFullAdmin ? "Administrator" : "Support administrator";

    get("adminPermissionsNav").hidden = !canManageAdmins;

    document.querySelectorAll("[data-full-admin-only]").forEach((element) => {

      element.hidden = !canManageFullAdmin;

    });



    const changeRole = async (userId, role) => {

      await api(`/admin/users/${encodeURIComponent(userId)}/role`, {

        method: "PATCH",

        body: JSON.stringify({ role })

      });

      await Promise.all([renderMembers(), renderAdmins(), loadOverview(), renderAudit()]);

    };



    const renderMembers = async () => {

      const query = get("adminMemberSearch").value.trim();

      const status = get("adminMemberFilter").value.toLowerCase();

      const { members } = await api(`/admin/members?search=${encodeURIComponent(query)}&status=${encodeURIComponent(status === "all" ? "" : status)}`);

      memberRows.innerHTML = members.map((member, index) => {

        const paused = member.status === "paused";

        const initials = member.full_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

        return `<tr><td><div class="member-detail"><span class="member-avatar ${index % 2 ? "blue" : "teal"}">${escapeHtml(initials)}</span><span><b>${escapeHtml(member.full_name)}</b><small>${escapeHtml(member.email)}</small></span></div></td><td>${escapeHtml(member.circle || "No circle")}</td><td>${escapeHtml(formatDate(member.created_at))}</td><td><span class="status-pill ${paused ? "paused" : ""}">${paused ? "Paused" : "Active"}</span></td><td><div class="table-actions"><button class="button button-secondary button-small" type="button" data-member-id="${escapeHtml(member.id)}" data-next-status="${paused ? "active" : "paused"}">${paused ? "Restore" : "Pause"}</button>${canManageAdmins ? `<button class="button button-secondary button-small" type="button" data-promote-id="${escapeHtml(member.id)}" data-role="support_admin">Grant support admin</button><button class="button button-secondary button-small" type="button" data-promote-id="${escapeHtml(member.id)}" data-role="admin">Grant full admin</button>` : ""}</div></td></tr>`;

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

      memberRows.querySelectorAll("[data-promote-id]").forEach((button) => button.addEventListener("click", async () => {

        button.disabled = true;

        try {

          await changeRole(button.dataset.promoteId, button.dataset.role);

        } catch (error) { showError(error); button.disabled = false; }

      }));

    };



    const loadOverview = async () => {

      const [overview, checkins] = await Promise.all([

        api("/admin/overview"),

        canManageFullAdmin ? api("/admin/checkins") : Promise.resolve({ circles: [] })

      ]);

      get("adminActiveCount").textContent = String(overview.members.active);

      get("adminCircleCount").textContent = String(overview.circles);

      get("adminCheckinsPending").textContent = String(overview.checkins_pending);

      get("adminReviewCount").textContent = String(overview.directory_pending);

      get("adminReviewCountLabel").textContent = String(overview.directory_pending);

      get("adminReviewCountSummary").textContent = String(overview.directory_pending);

      get("adminRegisteredCount").textContent = String(overview.members.total);

      get("adminRecentRegistrations").textContent = String(overview.members.recent);

      get("adminSuspendedCount").textContent = String(overview.members.suspended);

      get("adminSupportSignals").textContent = String(overview.support_signals_today);

      if (canManageFullAdmin) {

        const rows = checkins.circles.map((circle) => `<div class="quick-row"><span><b>${escapeHtml(circle.name)}</b><small>${circle.members} active members${circle.last_update ? ` · updated ${escapeHtml(formatTime(circle.last_update))}` : ""}</small></span><span class="state-dot ${circle.pending ? "pending" : ""}">${circle.checked_in} / ${circle.members} checked in</span></div>`);

        get("adminTodayCheckins").innerHTML = rows.length ? rows.join("") : '<div class="empty-state">No circles have been created yet.</div>';

        get("adminCheckinsTableRows").innerHTML = checkins.circles.length ? checkins.circles.map((circle) => `<tr><td><b>${escapeHtml(circle.name)}</b></td><td>${circle.members}</td><td>${circle.checked_in} / ${circle.members}</td><td>${circle.last_update ? escapeHtml(formatTime(circle.last_update)) : "No updates"}</td><td><span class="status-pill ${circle.pending ? "review" : ""}">${circle.pending ? `${circle.pending} pending` : "Complete"}</span></td></tr>`).join("") : '<tr><td colspan="5">No circles have been created yet.</td></tr>';

      }

    };



    const renderDirectory = async () => {

      const { listings } = await api("/admin/directory");

      get("adminDirectoryRows").innerHTML = listings.map((listing) => `<tr><td><b>${escapeHtml(listing.name)}</b></td><td>${escapeHtml(listing.category)}</td><td>${escapeHtml(listing.area)}</td><td><span class="status-pill ${listing.verified ? "" : "review"}">${listing.verified ? "Verified" : "Review"}</span></td><td><div class="table-actions"><button class="button ${listing.verified ? "button-secondary" : "button-primary"} button-small" type="button" data-listing-id="${escapeHtml(listing.id)}" data-verified="${!listing.verified}">${listing.verified ? "Mark for review" : "Verify listing"}</button><button class="button button-secondary button-small" type="button" data-edit-listing="${escapeHtml(listing.id)}">Edit</button>${listing.verified ? "" : `<button class="button button-secondary button-small" type="button" data-remove-listing="${escapeHtml(listing.id)}">Remove</button>`}</div></td></tr>`).join("");

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

      get("adminDirectoryRows").querySelectorAll("[data-edit-listing]").forEach((button) => button.addEventListener("click", () => {

        const listing = listings.find((item) => String(item.id) === button.dataset.editListing);

        if (!listing) return;

        get("listingId").value = String(listing.id);

        get("listingName").value = listing.name;

        get("listingCategory").value = listing.category;

        get("listingArea").value = listing.area;

        get("listingContact").value = listing.contact || "";

        get("adminDirectorySubmit").textContent = "Save changes";

        get("adminDirectoryCancel").hidden = false;

        get("listingName").scrollIntoView({ behavior: "smooth", block: "center" });

        get("listingName").focus();

      }));

      get("adminDirectoryRows").querySelectorAll("[data-remove-listing]").forEach((button) => button.addEventListener("click", async () => {

        if (!window.confirm("Remove this unverified service listing?")) return;

        button.disabled = true;

        try {

          await api(`/admin/directory/${encodeURIComponent(button.dataset.removeListing)}`, { method: "DELETE" });

          await Promise.all([renderDirectory(), renderAudit(), loadOverview()]);

        } catch (error) { showError(error); button.disabled = false; }

      }));

    };



    const renderInvitations = async () => {

      const { invitations } = await api("/admin/invitations");

      get("adminInvitationRows").innerHTML = invitations.length

        ? invitations.map((invitation) => {

          const canRevoke = invitation.status === "pending";

          return `<tr><td>${escapeHtml(invitation.invited_name || "Member")}</td><td>${escapeHtml(invitation.invited_email || "")}</td><td>${escapeHtml(formatDate(invitation.created_at))}</td><td>${invitation.expires_at ? escapeHtml(formatDate(invitation.expires_at)) : "No expiry"}</td><td><span class="status-pill ${canRevoke ? "review" : ""}">${escapeHtml(invitation.status)}</span></td><td>${canRevoke ? `<button class="button button-secondary button-small" type="button" data-revoke-invitation="${escapeHtml(invitation.id)}">Revoke</button>` : ""}</td></tr>`;

        }).join("")

        : '<tr><td colspan="6">No invitations have been created.</td></tr>';

      get("adminInvitationRows").querySelectorAll("[data-revoke-invitation]").forEach((button) => button.addEventListener("click", async () => {

        button.disabled = true;

        try {

          await api(`/admin/invitations/${encodeURIComponent(button.dataset.revokeInvitation)}`, { method: "DELETE" });

          await Promise.all([renderInvitations(), renderAudit()]);

        } catch (error) { showError(error); button.disabled = false; }

      }));

    };



    const renderAudit = async () => {

      const { entries } = await api("/admin/audit");

      get("adminAuditRows").innerHTML = entries.length

        ? entries.map((entry) => `<tr><td>${escapeHtml(new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.created_at)))}</td><td>${escapeHtml(entry.admin_name || entry.admin_email || "Former administrator")}</td><td>${escapeHtml(entry.action)}</td><td>${escapeHtml(JSON.stringify(entry.details || {}))}</td></tr>`).join("")

        : '<tr><td colspan="4">No administrative actions have been recorded.</td></tr>';

    };



    const renderAdmins = async () => {

      if (!canManageAdmins) return;

      const { admins } = await api("/admin/admins");

      get("adminRoleRows").innerHTML = admins.map((admin) => {

        const protectedAdmin = admin.is_super_admin;

        const roleName = admin.role === "support_admin" ? "Support administrator" : protectedAdmin ? "Super administrator" : "Full administrator";

        const changeRoleButton = protectedAdmin

          ? ""

          : `<button class="button button-secondary button-small" type="button" data-change-role-id="${escapeHtml(admin.id)}" data-next-role="${admin.role === "support_admin" ? "admin" : "support_admin"}">Make ${admin.role === "support_admin" ? "full" : "support"} admin</button><button class="button button-secondary button-small" type="button" data-demote-id="${escapeHtml(admin.id)}">Revoke admin</button>`;

        return `<tr><td><b>${escapeHtml(admin.full_name)}</b><small>${escapeHtml(admin.email)}</small></td><td><span class="status-pill ${admin.status === "active" ? "" : "paused"}">${escapeHtml(admin.status)}</span></td><td>${roleName}</td><td>${changeRoleButton}</td></tr>`;

      }).join("") || '<tr><td colspan="4">No administrators have been assigned.</td></tr>';

      get("adminRoleRows").querySelectorAll("[data-change-role-id]").forEach((button) => button.addEventListener("click", async () => {

        button.disabled = true;

        try {

          await changeRole(button.dataset.changeRoleId, button.dataset.nextRole);

        } catch (error) { showError(error); button.disabled = false; }

      }));

      get("adminRoleRows").querySelectorAll("[data-demote-id]").forEach((button) => button.addEventListener("click", async () => {

        button.disabled = true;

        try {

          await changeRole(button.dataset.demoteId, "user");

        } catch (error) { showError(error); button.disabled = false; }

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

        await Promise.all([

          renderInvitations(),

          canManageFullAdmin ? renderAudit() : Promise.resolve()

        ]);

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

        link.download = "nalsafe-check-in-summary.csv";

        link.click();

        URL.revokeObjectURL(link.href);

      } catch (error) { showError(error); }

    });



    const resetDirectoryForm = () => {

      get("adminDirectoryForm").reset();

      get("listingId").value = "";

      get("adminDirectorySubmit").textContent = "Add for review";

      get("adminDirectoryCancel").hidden = true;

    };

    get("adminDirectoryCancel").addEventListener("click", resetDirectoryForm);



    get("adminDirectoryForm").addEventListener("submit", async (event) => {

      event.preventDefault();

      const form = event.currentTarget;

      const submit = form.querySelector("button[type=submit]");

      const message = get("adminDirectoryMessage");

      submit.disabled = true;

      try {

        const listingId = get("listingId").value;

        await api(listingId ? `/admin/directory/${encodeURIComponent(listingId)}` : "/admin/directory", {

          method: listingId ? "PATCH" : "POST",

          body: JSON.stringify({

            name: get("listingName").value.trim(),

            category: get("listingCategory").value.trim(),

            area: get("listingArea").value.trim(),

            contact: get("listingContact").value.trim() || null

          })

        });

        resetDirectoryForm();

        showMessage(message, listingId ? "Listing changes saved." : "Listing saved and added to the review queue.");

        await Promise.all([renderDirectory(), loadOverview(), renderAudit()]);

      } catch (error) { showMessage(message, error.message, true); }

      finally { submit.disabled = false; }

    });



    get("adminProfileName").textContent = userSession.full_name;



    await Promise.all([

      loadOverview(),

      renderMembers(),

      canManageFullAdmin ? renderDirectory() : Promise.resolve(),

      renderInvitations(),

      canManageFullAdmin ? renderAudit() : Promise.resolve(),

      renderAdmins()

    ]);

  }

})();