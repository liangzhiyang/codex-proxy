import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let mockProxyUrl: string | null = null;
const mockExecFile = vi.fn();
const PROXY_ENV_KEYS = [
  "HTTPS_PROXY",
  "https_proxy",
  "HTTP_PROXY",
  "http_proxy",
  "ALL_PROXY",
  "all_proxy",
] as const;
const originalProxyEnv = new Map(PROXY_ENV_KEYS.map((key) => [key, process.env[key]]));

vi.mock("child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

vi.mock("@src/config.js", () => ({
  getConfig: () => ({
    tls: { proxy_url: mockProxyUrl },
  }),
}));

describe("proxy resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    mockProxyUrl = null;
    mockExecFile.mockReset();
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
      cb(null, "<dictionary> {\n  FTPPassive : 1\n}\n", "");
    });
    for (const key of PROXY_ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of PROXY_ENV_KEYS) {
      const original = originalProxyEnv.get(key);
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  });

  it("uses configured proxy_url before system proxy detection", async () => {
    mockProxyUrl = "http://127.0.0.1:1082";

    const { initProxy, getProxyUrl, resetProxyCache } = await import("@src/tls/proxy.js");
    resetProxyCache();
    await initProxy();

    expect(mockExecFile).not.toHaveBeenCalled();
    expect(getProxyUrl()).toBe("http://127.0.0.1:1082");
  });

  it("uses the macOS system HTTPS proxy when proxy_url is blank", async () => {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: (err: Error | null, stdout: string, stderr: string) => void) => {
      cb(null, [
        "<dictionary> {",
        "  FTPPassive : 1",
        "  HTTPSEnable : 1",
        "  HTTPSProxy : 127.0.0.1",
        "  HTTPSPort : 1082",
        "}",
      ].join("\n"), "");
    });

    const { initProxy, getProxyUrl, resetProxyCache } = await import("@src/tls/proxy.js");
    resetProxyCache();
    await initProxy();

    expect(mockExecFile).toHaveBeenCalledWith("scutil", ["--proxy"], expect.any(Object), expect.any(Function));
    expect(getProxyUrl()).toBe("http://127.0.0.1:1082");
  });

  it("uses proxy environment variables before macOS system proxy detection", async () => {
    process.env.HTTPS_PROXY = "http://127.0.0.1:2080";

    const { initProxy, getProxyUrl, resetProxyCache } = await import("@src/tls/proxy.js");
    resetProxyCache();
    await initProxy();

    expect(mockExecFile).not.toHaveBeenCalled();
    expect(getProxyUrl()).toBe("http://127.0.0.1:2080");
  });

  it("falls back to direct connection when proxy_url is blank and no system proxy exists", async () => {
    const { initProxy, getProxyUrl, resetProxyCache } = await import("@src/tls/proxy.js");
    resetProxyCache();
    await initProxy();

    expect(mockExecFile).toHaveBeenCalledWith("scutil", ["--proxy"], expect.any(Object), expect.any(Function));
    expect(getProxyUrl()).toBeNull();
  });
});
