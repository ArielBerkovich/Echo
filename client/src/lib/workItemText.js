export function workItemTypeEmoji(type) {
  const value = String(type || "").trim().toLowerCase();
  if (!value) return "";
  if (value === "epic") return "🏰";
  if (value === "feature") return "🧩";
  if (value === "bug") return "🐞";
  if (value === "task") return "🔨";
  if (value.includes("user story")) return "📜";
  if (value.includes("product backlog item")) return "🎯";
  if (value.includes("requirement")) return "🧾";
  if (value === "issue") return "🚩";
  if (value.includes("test case")) return "🧫";
  if (value.includes("test plan")) return "🗺️";
  if (value.includes("test suite")) return "🧬";
  if (value.includes("shared step")) return "👣";
  if (value.includes("shared parameter")) return "🎛️";
  if (value.includes("code review request")) return "📨";
  if (value.includes("code review response")) return "📬";
  if (value.includes("feedback request")) return "🎤";
  if (value.includes("feedback response")) return "📢";
  if (value.includes("change request")) return "🔁";
  if (value === "risk") return "🌩️";
  if (value === "review") return "🧐";
  if (value === "impediment") return "🧱";
  return "🗂️";
}

export function workItemLabel(id, item) {
  const type = String(item?.type || "");
  const typeLabel = [type, workItemTypeEmoji(type)].filter(Boolean).join(" ");
  return [`#${id} ${item?.title || ""}`, typeLabel ? `(${typeLabel})` : ""]
    .filter(Boolean)
    .join(" ");
}
