/**
 * Proxy detection and management.
 *
 * Resolves the effective upstream proxy for outbound requests.
 * Called once at startup, result is cached for the process lifetime.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { getConfig } from "../config.js";

const execFileAsync = promisify(execFile);

let _proxyUrl: string | null | undefined; // undefined = not yet detected

function proxyFromEnv(): string | null {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy ||
    null
  );
}

function valueFromScutil(output: string, key: string): string | null {
  const match = output.match(new RegExp(`(?:^|\\n)\\s*${key}\\s*:\\s*([^\\n]+)`));
  return match?.[1]?.trim() || null;
}

function enabledFromScutil(output: string, key: string): boolean {
  return valueFromScutil(output, key) === "1";
}

function makeProxyUrl(protocol: "http" | "socks5", host: string | null, port: string | null): string | null {
  if (!host || !port || !/^\d+$/.test(port)) return null;
  const normalizedHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `${protocol}://${normalizedHost}:${port}`;
}

function proxyFromScutil(output: string): string | null {
  if (enabledFromScutil(output, "HTTPSEnable")) {
    const proxy = makeProxyUrl(
      "http",
      valueFromScutil(output, "HTTPSProxy"),
      valueFromScutil(output, "HTTPSPort"),
    );
    if (proxy) return proxy;
  }

  if (enabledFromScutil(output, "HTTPEnable")) {
    const proxy = makeProxyUrl(
      "http",
      valueFromScutil(output, "HTTPProxy"),
      valueFromScutil(output, "HTTPPort"),
    );
    if (proxy) return proxy;
  }

  if (enabledFromScutil(output, "SOCKSEnable")) {
    return makeProxyUrl(
      "socks5",
      valueFromScutil(output, "SOCKSProxy"),
      valueFromScutil(output, "SOCKSPort"),
    );
  }

  return null;
}

async function detectSystemProxy(): Promise<string | null> {
  const envProxy = proxyFromEnv();
  if (envProxy) return envProxy;

  try {
    const result = await execFileAsync("scutil", ["--proxy"], { timeout: 1000 });
    const stdout = typeof result === "string" || Buffer.isBuffer(result)
      ? result
      : result.stdout;
    return proxyFromScutil(String(stdout));
  } catch {
    return null;
  }
}

/**
 * Initialize proxy detection. Called once at startup from index.ts.
 * Priority: configured proxy_url > environment/system proxy > direct connection.
 */
export async function initProxy(): Promise<void> {
  const config = getConfig();
  if (config.tls.proxy_url) {
    _proxyUrl = config.tls.proxy_url;
    console.log(`[Proxy] Using configured proxy: ${_proxyUrl}`);
    return;
  }

  const systemProxy = await detectSystemProxy();
  if (systemProxy) {
    _proxyUrl = systemProxy;
    console.log(`[Proxy] Using system proxy: ${_proxyUrl}`);
    return;
  }

  _proxyUrl = null;
  console.log("[Proxy] No system proxy configured — direct connection");
}

/**
 * Get the detected proxy URL (or null if no proxy).
 */
export function getProxyUrl(): string | null {
  return _proxyUrl ?? null;
}

/**
 * Reset the cached proxy state (for testing).
 */
export function resetProxyCache(): void {
  _proxyUrl = undefined;
}
