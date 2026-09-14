import { URL } from "url";

/**
 * SSRF Protection Utility for External Job Source Ingestion.
 * Prevents unauthorized requests to internal networks, loopbacks,
 * link-local addresses, and cloud provider metadata services.
 */

export interface SsrfValidationResult {
  isSafe: boolean;
  errorCode?: string;
  reason?: string;
}

// Regex to identify IPv4 addresses
const IPV4_REGEX = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

// Prohibited internal domains and prefixes
const PROHIBITED_HOSTNAMES = [
  "localhost",
  "metadata.google.internal",
  "instance-data",
  "metadata",
  "kubernetes.default"
];

/**
 * Validates that an external URL is technically and legally safe to request.
 */
export function validateExternalJobUrl(rawUrl: string): SsrfValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return {
      isSafe: false,
      errorCode: "INVALID_URL",
      reason: "URL must be a non-empty string."
    };
  }

  const trimmed = rawUrl.trim();
  if (trimmed.length > 2048) {
    return {
      isSafe: false,
      errorCode: "URL_TOO_LONG",
      reason: "URL exceeds maximum permitted length of 2048 characters."
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      isSafe: false,
      errorCode: "MALFORMED_URL",
      reason: "Failed to parse URL structure."
    };
  }

  // 1. Enforce strict HTTP/HTTPS protocol
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return {
      isSafe: false,
      errorCode: "DISALLOWED_PROTOCOL",
      reason: `Protocol "${protocol}" is prohibited. Only HTTP and HTTPS are permitted.`
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Reject internal/metadata hostnames
  if (PROHIBITED_HOSTNAMES.includes(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return {
      isSafe: false,
      errorCode: "SSRF_PROHIBITED_HOST",
      reason: "Access to private or local hostnames is strictly blocked."
    };
  }

  // 3. IPv6 checks
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const rawIpv6 = hostname.slice(1, -1).toLowerCase();
    if (
      rawIpv6 === "::1" || 
      rawIpv6.startsWith("fc") || 
      rawIpv6.startsWith("fd") || 
      rawIpv6.startsWith("fe80")
    ) {
      return {
        isSafe: false,
        errorCode: "SSRF_PROHIBITED_IP",
        reason: "Access to private or loopback IPv6 addresses is strictly blocked."
      };
    }
  }

  // 4. IPv4 checks
  const ipv4Match = hostname.match(IPV4_REGEX);
  if (ipv4Match) {
    const octet1 = parseInt(ipv4Match[1], 10);
    const octet2 = parseInt(ipv4Match[2], 10);
    const octet3 = parseInt(ipv4Match[3], 10);
    const octet4 = parseInt(ipv4Match[4], 10);

    if (octet1 > 255 || octet2 > 255 || octet3 > 255 || octet4 > 255) {
      return {
        isSafe: false,
        errorCode: "MALFORMED_IP",
        reason: "Invalid IP address octet values."
      };
    }

    // Loopback 127.0.0.0/8
    if (octet1 === 127) {
      return {
        isSafe: false,
        errorCode: "SSRF_LOOPBACK",
        reason: "Loopback IP addresses (127.0.0.0/8) are prohibited."
      };
    }

    // Zero network / Current host
    if (octet1 === 0) {
      return {
        isSafe: false,
        errorCode: "SSRF_CURRENT_NETWORK",
        reason: "0.0.0.0/8 network addresses are prohibited."
      };
    }

    // Private Subnets: 10.0.0.0/8
    if (octet1 === 10) {
      return {
        isSafe: false,
        errorCode: "SSRF_PRIVATE_NETWORK",
        reason: "Private class A subnet (10.0.0.0/8) is prohibited."
      };
    }

    // Private Subnets: 172.16.0.0/12 (172.16 - 172.31)
    if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) {
      return {
        isSafe: false,
        errorCode: "SSRF_PRIVATE_NETWORK",
        reason: "Private class B subnet (172.16.0.0/12) is prohibited."
      };
    }

    // Private Subnets: 192.168.0.0/16
    if (octet1 === 192 && octet2 === 168) {
      return {
        isSafe: false,
        errorCode: "SSRF_PRIVATE_NETWORK",
        reason: "Private class C subnet (192.168.0.0/16) is prohibited."
      };
    }

    // Link-Local / Cloud Metadata: 169.254.0.0/16 (includes 169.254.169.254)
    if (octet1 === 169 && octet2 === 254) {
      return {
        isSafe: false,
        errorCode: "SSRF_CLOUD_METADATA",
        reason: "Link-local and cloud metadata addresses (169.254.0.0/16) are strictly prohibited."
      };
    }

    // Broadcast / Multicast: 224.0.0.0+
    if (octet1 >= 224) {
      return {
        isSafe: false,
        errorCode: "SSRF_MULTICAST_BROADCAST",
        reason: "Multicast or broadcast addresses are prohibited."
      };
    }
  }

  return { isSafe: true };
}

/**
 * Safe fetch wrapper with SSRF validation, strict timeout, and response body size limit.
 */
export async function safeFetchExternalJobUrl(
  url: string,
  options: RequestInit = {},
  maxBytes: number = 2 * 1024 * 1024 // 2MB default max
): Promise<{ ok: boolean; status: number; text: string; error?: string }> {
  const validation = validateExternalJobUrl(url);
  if (!validation.isSafe) {
    return {
      ok: false,
      status: 400,
      text: "",
      error: `SSRF validation failed: ${validation.reason} (${validation.errorCode})`
    };
  }

  const timeoutMs = 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "Resumix-JobIngest/1.0 (Public Postings Ingestion; +https://resumix.io)",
        "Accept": "text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8",
        ...(options.headers || {})
      }
    });

    clearTimeout(timer);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        text: "",
        error: `Remote server responded with HTTP ${response.status} ${response.statusText}`
      };
    }

    const text = await response.text();
    if (text.length > maxBytes) {
      return {
        ok: false,
        status: 413,
        text: "",
        error: `Response size (${text.length} bytes) exceeds limit of ${maxBytes} bytes.`
      };
    }

    return {
      ok: true,
      status: response.status,
      text
    };
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      return {
        ok: false,
        status: 408,
        text: "",
        error: `Request timed out after ${timeoutMs}ms.`
      };
    }
    return {
      ok: false,
      status: 500,
      text: "",
      error: err.message || "Network error fetching external job source."
    };
  }
}

export function isSafeExternalUrl(rawUrl: string): boolean {
  return validateExternalJobUrl(rawUrl).isSafe;
}
