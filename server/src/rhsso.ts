import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

const FLOW_TTL_SECONDS = 10 * 60;
let discoveryCache;
let jwksCache;

function assertConfigured() {
  if (!config.rhsso.enabled) throw Object.assign(new Error("RHSSO login is disabled"), { status: 404 });
  if (!config.rhsso.url || !config.rhsso.realm || !config.rhsso.clientId) {
    throw Object.assign(new Error("RHSSO is enabled but its URL, realm, or client ID is missing"), { status: 503 });
  }
}

export function rhssoIssuer() {
  assertConfigured();
  return `${config.rhsso.url}/realms/${encodeURIComponent(config.rhsso.realm)}`;
}

export function rhssoRedirectUri() {
  return config.rhsso.redirectUri || `${config.clientOrigin.replace(/\/+$/, "")}/api/auth/rhsso/callback`;
}

function backchannelEndpoint(endpoint) {
  if (!config.rhsso.backchannelUrl) return endpoint;
  const publicBase = `${config.rhsso.url}/`;
  if (!String(endpoint).startsWith(publicBase)) throw new Error("RHSSO returned an endpoint outside its configured URL");
  return `${config.rhsso.backchannelUrl}/${String(endpoint).slice(publicBase.length)}`;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`RHSSO returned HTTP ${response.status}`);
  return response.json();
}

async function discovery() {
  const issuer = rhssoIssuer();
  if (!discoveryCache || discoveryCache.issuer !== issuer) {
    const discoveryIssuer = config.rhsso.backchannelUrl
      ? `${config.rhsso.backchannelUrl}/realms/${encodeURIComponent(config.rhsso.realm)}`
      : issuer;
    const document = await getJson(`${discoveryIssuer}/.well-known/openid-configuration`);
    if (document.issuer !== issuer) throw new Error("RHSSO discovery returned an unexpected issuer");
    discoveryCache = { issuer, document };
  }
  return discoveryCache.document;
}

export async function beginRhssoLogin() {
  const metadata = await discovery();
  const state = crypto.randomBytes(24).toString("base64url");
  const nonce = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const flowToken = jwt.sign(
    { kind: "rhsso-flow", state, nonce, verifier },
    config.jwtSecret,
    { expiresIn: FLOW_TTL_SECONDS }
  );
  const params = new URLSearchParams({
    client_id: config.rhsso.clientId,
    redirect_uri: rhssoRedirectUri(),
    response_type: "code",
    scope: "openid profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return { authorizationUrl: `${metadata.authorization_endpoint}?${params}`, flowToken };
}

function readClaim(claims, path) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((value, key) => (value && typeof value === "object" ? value[key] : undefined), claims);
}

async function signingKey(metadata, header) {
  if (!header.kid) throw new Error("RHSSO ID token has no key ID");
  const jwksUri = backchannelEndpoint(metadata.jwks_uri);
  if (!jwksCache || jwksCache.uri !== jwksUri) {
    jwksCache = { uri: jwksUri, document: await getJson(jwksUri) };
  }
  let jwk = jwksCache.document.keys?.find((key) => key.kid === header.kid);
  if (!jwk) {
    jwksCache = { uri: jwksUri, document: await getJson(jwksUri) };
    jwk = jwksCache.document.keys?.find((key) => key.kid === header.kid);
  }
  if (!jwk) throw new Error("RHSSO ID token was signed by an unknown key");
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

export async function finishRhssoLogin({ code, state, flowToken }) {
  assertConfigured();
  let flow;
  try {
    flow = jwt.verify(flowToken, config.jwtSecret);
  } catch {
    throw Object.assign(new Error("The RHSSO login attempt expired; please try again"), { status: 400 });
  }
  if (flow.kind !== "rhsso-flow" || !state || state !== flow.state || !code) {
    throw Object.assign(new Error("Invalid RHSSO login callback"), { status: 400 });
  }

  const metadata = await discovery();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.rhsso.clientId,
    redirect_uri: rhssoRedirectUri(),
    code,
    code_verifier: flow.verifier,
  });
  if (config.rhsso.clientSecret) body.set("client_secret", config.rhsso.clientSecret);
  const response = await fetch(backchannelEndpoint(metadata.token_endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const tokens = await response.json().catch(() => ({}));
  if (!response.ok || !tokens.id_token) {
    throw Object.assign(new Error("RHSSO rejected the authorization code"), { status: 401 });
  }

  const decoded = jwt.decode(tokens.id_token, { complete: true });
  const allowedAlgorithms = ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512"];
  if (!decoded || !allowedAlgorithms.includes(decoded.header?.alg)) throw new Error("Unsupported RHSSO ID token signature");
  const key = await signingKey(metadata, decoded.header);
  const claims = jwt.verify(tokens.id_token, key, {
    algorithms: allowedAlgorithms,
    issuer: rhssoIssuer(),
    audience: config.rhsso.clientId,
  });
  if (claims.nonce !== flow.nonce || !claims.sub) throw new Error("Invalid RHSSO ID token claims");

  const configuredDisplayName = readClaim(claims, config.rhsso.displayNameClaim);
  const fallbackDisplayName = [claims.given_name, claims.family_name].filter(Boolean).join(" ");
  return {
    issuer: claims.iss,
    subject: claims.sub,
    username: readClaim(claims, config.rhsso.usernameClaim) || claims.preferred_username || claims.sub,
    displayName: configuredDisplayName || fallbackDisplayName || claims.preferred_username || claims.sub,
  };
}

export function rhssoCookie(flowToken) {
  const secure = rhssoRedirectUri().startsWith("https://") ? "; Secure" : "";
  return `echo_rhsso_flow=${encodeURIComponent(flowToken)}; Path=/api/auth/rhsso; HttpOnly; SameSite=Lax; Max-Age=${FLOW_TTL_SECONDS}${secure}`;
}

export function clearRhssoCookie() {
  return "echo_rhsso_flow=; Path=/api/auth/rhsso; HttpOnly; SameSite=Lax; Max-Age=0";
}

export function cookieValue(cookieHeader, name) {
  for (const part of String(cookieHeader || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}
