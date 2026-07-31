const STATIC_VIEWS = new Set(["browse", "activity", "saved", "dms", "settings"]);

export function workspacePath({ view = "home", convId = null, convName = null, convType = null, searchQuery = null } = {}) {
  const conversation = convName || convId;
  if (searchQuery) return `/search?q=${encodeURIComponent(searchQuery)}`;
  if (view === "browse") return "/browse";
  if (view === "activity") return "/activity";
  if (view === "saved") return "/saved";
  if (view === "settings") return "/settings";
  if (view === "dms") return conversation && convType === "dm" ? `/dms/${encodeURIComponent(conversation)}` : "/dms";
  if (conversation) {
    if (convType === "dm") return `/home/dms/${encodeURIComponent(conversation)}`;
    return `/channels/${encodeURIComponent(conversation)}`;
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
    return { overlay: null, view: "home", convId: id, convType: "channel", searchQuery: null };
  }
  if (section === "home" && id === "dms" && parts[2]) {
    return { overlay: null, view: "home", convId: parts[2], convType: "dm", searchQuery: null };
  }
  if (section === "dms") {
    return { overlay: null, view: "dms", convId: id || null, convType: id ? "dm" : null, searchQuery: null };
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
