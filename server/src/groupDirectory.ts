import {
  listRhssoGroups,
  rhssoDirectoryEnabled,
  rhssoGroup,
  rhssoGroupMembers,
} from "./rhssoDirectory.js";

// Provider-neutral contract for a group source. Future local, LDAP, SCIM, or
// application-owned groups only need to implement this boundary; routes,
// mentions, message history, and the client API stay unchanged.
const providers = new Map([
  ["rhsso", {
    enabled: rhssoDirectoryEnabled,
    listGroups: listRhssoGroups,
    getGroup: rhssoGroup,
    getMembers: rhssoGroupMembers,
  }],
]);

function providerFor(id: string) {
  return providers.get(String(id || ""));
}

function publicGroup(provider: string, group: any) {
  return { ...group, provider };
}

export function groupDirectoryEnabled() {
  return [...providers.values()].some((provider: any) => provider.enabled());
}

export async function listGroups() {
  const available = [...providers.entries()].filter(([, provider]: any) => provider.enabled());
  const groups = await Promise.all(available.map(async ([id, provider]: any) =>
    (await provider.listGroups()).map((group: any) => publicGroup(id, group))
  ));
  const listedGroups = groups.flat();
  // Keep directory-only groups out of every consumer of this endpoint. In
  // particular, this prevents empty groups from appearing in the mention
  // picker before a user has opened the group details.
  const withEchoMembers = await Promise.all(listedGroups.map(async (group: any) => {
    const members = await getGroupMembers(group.provider, group.id);
    return members?.some((member: any) => member.echoUser) ? group : null;
  }));
  return withEchoMembers.filter(Boolean);
}

export async function getGroup(providerId: string, groupId: string) {
  const provider: any = providerFor(providerId);
  if (!provider || !provider.enabled()) return null;
  const group = await provider.getGroup(groupId);
  return group ? publicGroup(providerId, group) : null;
}

export async function getGroupMembers(providerId: string, groupId: string) {
  const provider: any = providerFor(providerId);
  if (!provider || !provider.enabled()) return null;
  return provider.getMembers(groupId);
}

// Mention wire syntax is provider-qualified, e.g. @group.rhsso.<uuid>. The
// provider id prevents collisions when Echo later supports local groups.
export async function resolveGroupMentions(body: string) {
  const text = String(body || "");
  const qualified = [...text.matchAll(/@group\.([a-z0-9_-]{1,32})\.([a-zA-Z0-9-]{1,80})\b/g)]
    .map((match) => ({ provider: match[1], id: match[2] }));
  // Keep messages composed during the initial RHSSO-only rollout valid.
  const legacy = [...text.matchAll(/@group\.([a-zA-Z0-9-]{1,80})\b/g)]
    .filter((match) => !match[0].includes(".rhsso."))
    .map((match) => ({ provider: "rhsso", id: match[1] }));
  const references = [...new Map([...qualified, ...legacy].map((reference) => [`${reference.provider}:${reference.id}`, reference])).values()];
  const resolved = await Promise.all(references.map(async ({ provider, id }) => {
    const group = await getGroup(provider, id);
    if (!group) return null;
    const members = await getGroupMembers(provider, id);
    if (!members) return null;
    return {
      ...group,
      memberCount: members.length,
      echoMemberIds: members.filter((member: any) => member.echoUser).map((member: any) => member.echoUser.id),
    };
  }));
  return resolved.filter(Boolean);
}
