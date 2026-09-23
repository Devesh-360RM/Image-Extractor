// src/lib/security.ts
var PRIVATE_IP_PATTERNS = [
  /^127\./,
  // Loopback 127.0.0.0/8
  /^10\./,
  // Private 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  // Private 172.16.0.0/12
  /^192\.168\./,
  // Private 192.168.0.0/16
  /^169\.254\./,
  // Link-local / Cloud Metadata 169.254.0.0/16
  /^0\./,
  // Current network 0.0.0.0/8
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./,
  // Carrier-grade NAT 100.64.0.0/10
  /^::1$/,
  // IPv6 loopback
  /^fc00:/i,
  // IPv6 unique local
  /^fe80:/i
  // IPv6 link-local
];
var DISALLOWED_HOSTNAMES = /* @__PURE__ */ new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "instance-data",
  "169.254.169.254"
]);
function validatePublicUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { isValid: false, error: "URL must be a non-empty string." };
  }
  const trimmed = rawUrl.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { isValid: false, error: "Invalid URL format." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { isValid: false, error: "Only public HTTP and HTTPS protocols are allowed." };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (DISALLOWED_HOSTNAMES.has(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return { isValid: false, error: "Access to private, localhost, or internal hostnames is prohibited." };
  }
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return { isValid: false, error: "Access to private or link-local IP addresses is prohibited." };
    }
  }
  return {
    isValid: true,
    normalizedUrl: parsed.toString()
  };
}
var SECURE_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache"
};
export {
  SECURE_FETCH_HEADERS,
  validatePublicUrl
};
