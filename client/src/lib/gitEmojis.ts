import gitUrl from "../assets/git-emojis/git.svg?url";
import branchUrl from "../assets/git-emojis/git-branch.svg?url";
import commitUrl from "../assets/git-emojis/git-commit.svg?url";
import mergeUrl from "../assets/git-emojis/git-merge.svg?url";
import pullRequestUrl from "../assets/git-emojis/git-pull-request.svg?url";
import pullRequestClosedUrl from "../assets/git-emojis/git-pull-request-closed.svg?url";
import mergedUrl from "../assets/git-emojis/merged.svg?url";
import githubUrl from "../assets/git-emojis/github.svg?url";

// Vite resolves imported assets to file:// URLs in packaged Electron builds.
// Store them as paths relative to index.html so the Markdown sanitizer can keep
// its deliberately narrow URL policy without allowing arbitrary local files.
const portableAssetUrl = (url) =>
  url.startsWith("file:") ? `./assets/${url.slice(url.lastIndexOf("/") + 1)}` : url;

// Git workflow emoji ship with Echo, so they are available in every workspace
// without database or object-storage setup. Static imports let Vite fingerprint
// and package the assets correctly for web, Electron, and Tauri builds.
export const BUILT_IN_GIT_EMOJIS = Object.freeze([
  { id: "builtin:git", name: "git", url: portableAssetUrl(gitUrl), isBuiltIn: true },
  { id: "builtin:git-branch", name: "git-branch", url: portableAssetUrl(branchUrl), isBuiltIn: true },
  { id: "builtin:git-commit", name: "git-commit", url: portableAssetUrl(commitUrl), isBuiltIn: true },
  { id: "builtin:git-merge", name: "git-merge", url: portableAssetUrl(mergeUrl), isBuiltIn: true },
  { id: "builtin:git-pull-request", name: "git-pull-request", url: portableAssetUrl(pullRequestUrl), isBuiltIn: true },
  { id: "builtin:git-pull-request-closed", name: "git-pull-request-closed", url: portableAssetUrl(pullRequestClosedUrl), isBuiltIn: true },
  { id: "builtin:merged", name: "merged", url: portableAssetUrl(mergedUrl), isBuiltIn: true },
  { id: "builtin:github", name: "github", url: portableAssetUrl(githubUrl), isBuiltIn: true },
]);
