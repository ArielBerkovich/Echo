export function apiEndpointKey(endpoint) {
  return endpoint.id || `${endpoint.method} ${endpoint.path}`;
}
