import { describe, it, expect } from "vitest";
import { getWebLoginConfig } from "../../open-sse/services/webLoginConfig.js";
import { harvest, cancelWebLogin } from "../../open-sse/services/webLogin.js";

const config = getWebLoginConfig("deepseek-web");
const { validateToken } = config;
// 合成占位，不是真实凭证；长度 ≥ 20，旧逻辑会误判 ready。
const FRESH_PROFILE_PLACEHOLDER = JSON.stringify({ value: null, __version: "0" });
const SYNTHETIC_TOKEN = "x".repeat(40);

const makeContext = ({ localStorage = {}, cookies = [] } = {}) => ({
  cookies: async () => cookies,
  pages: () => [
    {
      url: () => "https://chat.deepseek.com/sign_in",
      // harvest 把 names 传给 page.evaluate；测试里直接回合同名条目，不读真实浏览器。
      evaluate: async (_fn, names) => {
        const out = {};
        for (const name of names) {
          if (localStorage[name]) out[name] = localStorage[name];
        }
        return out;
      },
    },
  ],
});

describe("deepseek-web login token validation", () => {
  it("rejects the public synthetic fresh-profile placeholder that used to pass by JSON length", () => {
    expect(FRESH_PROFILE_PLACEHOLDER.length).toBeGreaterThanOrEqual(20);
    expect(validateToken(FRESH_PROFILE_PLACEHOLDER)).toBe(false);
    expect(validateToken('{"value":null,"__version":"0"}')).toBe(false);
  });

  it("rejects anonymous, null, non-string, empty, and malformed wrapper credentials", () => {
    expect(validateToken(null)).toBe(false);
    expect(validateToken(undefined)).toBe(false);
    expect(validateToken(123)).toBe(false);
    expect(validateToken({ value: SYNTHETIC_TOKEN })).toBe(false);
    expect(validateToken("")).toBe(false);
    expect(validateToken("   ")).toBe(false);
    expect(validateToken(JSON.stringify({ value: "", __version: "0" }))).toBe(false);
    expect(validateToken(JSON.stringify({ value: "short", __version: "0" }))).toBe(false);
    expect(validateToken(JSON.stringify({ value: 12345678901234567890, __version: "0" }))).toBe(false);
    expect(validateToken(JSON.stringify({ __version: "0" }))).toBe(false);
    expect(validateToken(JSON.stringify({ value: ["not", "a", "string"] }))).toBe(false);
    expect(validateToken(`{"value":null,"__version":"0"`)).toBe(false);
    expect(validateToken(`{"value":"${SYNTHETIC_TOKEN}"`)).toBe(false);
  });

  it("accepts a wrapped string token once it looks like a real credential", () => {
    expect(validateToken(JSON.stringify({ value: SYNTHETIC_TOKEN, __version: "0" }))).toBe(true);
    expect(validateToken(`  ${JSON.stringify({ value: SYNTHETIC_TOKEN, __version: "0" })}  `)).toBe(true);
  });

  it("accepts a raw unwrapped token and still rejects short raw values", () => {
    expect(validateToken(SYNTHETIC_TOKEN)).toBe(true);
    expect(validateToken(`  ${SYNTHETIC_TOKEN}  `)).toBe(true);
    expect(validateToken("not-long-enough")).toBe(false);
  });
});

describe("deepseek-web harvest readiness", () => {
  it("does not mark a fresh profile placeholder as ready", async () => {
    const found = await harvest(
      makeContext({ localStorage: { userToken: FRESH_PROFILE_PLACEHOLDER } }),
      config
    );
    expect(found.ready).toBe(false);
    expect(found.localStorageValues.userToken).toBe(FRESH_PROFILE_PLACEHOLDER);
  });

  it("stays not-ready when userToken is missing entirely", async () => {
    const found = await harvest(makeContext(), config);
    expect(found.ready).toBe(false);
  });

  it("does not mark a truncated JSON wrapper as ready", async () => {
    const found = await harvest(
      makeContext({ localStorage: { userToken: `{"value":null,"__version":"0"` } }),
      config
    );
    expect(found.ready).toBe(false);
  });

  it("marks a valid wrapped or raw synthetic token as ready without calling DeepSeek", async () => {
    const wrapped = JSON.stringify({ value: SYNTHETIC_TOKEN, __version: "0" });
    const wrappedFound = await harvest(makeContext({ localStorage: { userToken: wrapped } }), config);
    expect(wrappedFound.ready).toBe(true);

    const rawFound = await harvest(makeContext({ localStorage: { userToken: SYNTHETIC_TOKEN } }), config);
    expect(rawFound.ready).toBe(true);
  });
});

describe("web login cancel without a running browser session", () => {
  it("leaves timeout/cancel available and reports nothing to cancel", () => {
    expect(cancelWebLogin("deepseek-web")).toBe(false);
  });
});
