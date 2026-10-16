import assert from "node:assert/strict";
import test from "node:test";
import { safeAppPath, expiredCallbackPath, completeEmailSession } from "../src/lib/auth-callback.ts";

test("email and sign-in redirects cannot escape the application", () => {
  for (const path of [null, "https://outside.invalid", "//outside.invalid", "/\\outside.invalid", "/%5coutside.invalid", "/%2foutside.invalid", "javascript:alert(1)", "/\n/outside.invalid", "/%0d/outside.invalid", "/%zz"]) {
    assert.equal(safeAppPath(path), "/dashboard", String(path));
  }
  assert.equal(safeAppPath("/reset-password?welcome=1"), "/reset-password?welcome=1");
  assert.equal(safeAppPath("/assets?q=https%3A%2F%2Fexample.invalid"), "/assets?q=https%3A%2F%2Fexample.invalid");
});

test("expired invitation preserves its welcome query and clears fragment credentials", () => {
  assert.equal(expiredCallbackPath("/reset-password?welcome=1#access_token=discard"), "/reset-password?welcome=1&link=expired");
});

test("invitation session clears the address bar before exchanging its token pair", async () => {
  const calls = [];
  assert.equal(await completeEmailSession("#access_token=test-access&refresh_token=test-refresh&type=invite", {
    clearFragment: () => calls.push("clear"),
    setSession: async tokens => { calls.push(tokens); return { error: null }; },
  }), true);
  assert.deepEqual(calls, ["clear", { access_token: "test-access", refresh_token: "test-refresh" }]);
});

test("missing, expired and rejected email links cannot reuse an existing session", async () => {
  for (const fragment of ["", "#access_token=only", "#error_code=otp_expired&access_token=a&refresh_token=b"]) {
    let exchanged = false;
    assert.equal(await completeEmailSession(fragment, {
      clearFragment: () => {}, setSession: async () => { exchanged = true; return { error: null }; },
    }), false);
    assert.equal(exchanged, false);
  }
  assert.equal(await completeEmailSession("#access_token=a&refresh_token=b", {
    clearFragment: () => {}, setSession: async () => ({ error: Error("invalid") }),
  }), false);
  assert.equal(await completeEmailSession("#access_token=a&refresh_token=b", {
    clearFragment: () => {}, setSession: async () => { throw Error("unavailable"); },
  }), false);
});

