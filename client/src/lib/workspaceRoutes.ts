const STATIC_VIEWS = new Set(["browse", "activity", "saved", "dms", "settings"]);
const SETTINGS_TABS = new Set(["account", "appearance", "workspace", "integrations", "desktop", "api"]);

export function workspacePath({ view = "home", convId = null, convName = null, convType = null, searchQuery = null, settingsTab = "account", messageId = null, threadId = null } = {}) {
  const messageQuery = messageId
    ? `?message=${encodeURIComponent(messageId)}${threadId ? `&thread=${encodeURIComponent(threadId)}` : ""}`
    : "";
  const conversation = convName || convId;
  if (searchQuery) return `/search?q=${encodeURIComponent(searchQuery)}`;
  if (view === "browse") return "/browse";
  if (view === "activity") return "/activity";
  if (view === "saved") return "/saved";
  if (view === "settings") return `/settings/${SETTINGS_TABS.has(settingsTab) ? settingsTab : "account"}`;
  if (view === "dms") {
    if (!conversation || convType !== "dm") return "/dms";
    const path = `/dms/${encodeURIComponent(conversation)}`;
    return messageQuery ? `${path}${messageQuery}` : path;
  }
  if (conversation) {
    const path = convType === "dm"
      ? `/home/dms/${encodeURIComponent(conversation)}`
      : `/channels/${encodeURIComponent(conversation)}`;
    return messageQuery ? `${path}${messageQuery}` : path;
  }
  return "/";
}

export function parseWorkspacePath(pathname = "/", search = "") {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [section, id] = parts;

  if (section === "api-docs") {
    return { overlay: section, view: "home", convId: null, convType: null, searchQuery: null };
  }
  if (section === "search") {
    return {
      overlay: null,
      view: "home",
      convId: null,
      convType: null,
      searchQuery: new URLSearchParams(search).get("q") || null,
    };
  }
  if (section === "channels" && id) {
    const params = new URLSearchParams(search);
    const messageId = params.get("message");
    const threadId = params.get("thread");
    return { overlay: null, view: "home", convId: id, convType: "channel", ...(messageId ? { messageId } : {}), ...(threadId ? { threadId } : {}), searchQuery: null };
  }
  if (section === "home" && id === "dms" && parts[2]) {
    const params = new URLSearchParams(search);
    const messageId = params.get("message");
    const threadId = params.get("thread");
    return { overlay: null, view: "home", convId: parts[2], convType: "dm", ...(messageId ? { messageId } : {}), ...(threadId ? { threadId } : {}), searchQuery: null };
  }
  if (section === "dms") {
    const params = new URLSearchParams(search);
    const messageId = params.get("message");
    const threadId = params.get("thread");
    return { overlay: null, view: "dms", convId: id || null, convType: id ? "dm" : null, ...(messageId ? { messageId } : {}), ...(threadId ? { threadId } : {}), searchQuery: null };
  }
  if (section === "settings") {
    return { overlay: null, view: "settings", settingsTab: SETTINGS_TABS.has(id) ? id : "account", convId: null, convType: null, searchQuery: null };
  }
  if (STATIC_VIEWS.has(section)) {
    return { overlay: null, view: section, convId: null, convType: null, searchQuery: null };
  }
  return { overlay: null, view: "home", convId: null, convType: null, searchQuery: null };
}

export function currentRoute(location) {
  const route = parseWorkspacePath(location.pathname, location.search);
  if (!route.overlay) return route;

  const background = location.state?.workspacePath;
  return {
    ...parseWorkspacePath(
      typeof background === "string" ? background.split("?")[0] : "/",
      typeof background === "string" && background.includes("?") ? `?${background.split("?").slice(1).join("?")}` : ""
    ),
    overlay: route.overlay,
  };
}
