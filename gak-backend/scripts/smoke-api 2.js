#!/usr/bin/env node
/* eslint-disable no-console */

const baseUrl = String(process.env.SMOKE_BASE_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
const email = `smoke_${Date.now()}_${Math.floor(Math.random() * 10000)}@gak.local`;
const password = "SmokePass123";

async function request(path, { method = "GET", token = "", body, expectedStatus = [200] } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const contentType = String(response.headers.get("content-type") || "");
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];

  if (!expected.includes(response.status)) {
    const err = new Error(`Unexpected status ${response.status} for ${method} ${path}`);
    err.response = { status: response.status, payload };
    throw err;
  }

  return { status: response.status, payload };
}

async function run() {
  console.log(`[smoke] Base URL: ${baseUrl}`);

  await request("/health", { expectedStatus: [200] });
  console.log("[smoke] health ok");

  await request("/api/users/register", {
    method: "POST",
    body: { fullName: "Smoke User", email, password },
    expectedStatus: [201]
  });
  console.log("[smoke] register ok");

  const login = await request("/api/users/login", {
    method: "POST",
    body: { email, password },
    expectedStatus: [200]
  });
  const token = String(login.payload?.token || "");
  const userId = String(login.payload?.user?.userId || "");
  if (!token || !userId) {
    throw new Error("Login response missing token/userId");
  }
  console.log("[smoke] login ok");

  await request("/api/users/me", { token, expectedStatus: [200] });
  console.log("[smoke] auth profile ok");

  await request("/api/advanced-analytics/behavior-summary", { token, expectedStatus: [200] });
  await request("/api/integrations/calendar/events", { token, expectedStatus: [200] });
  await request(`/api/academic/timetable/${encodeURIComponent(userId)}`, { token, expectedStatus: [200] });
  console.log("[smoke] planner endpoints ok");

  await request("/api/integrations/academia/status", { token, expectedStatus: [200] });
  await request("/api/integrations/academia/sync", { method: "POST", token, body: {}, expectedStatus: [200, 400] });
  console.log("[smoke] gyaan sync endpoint reachable");

  await request("/api/users/me", {
    method: "DELETE",
    token,
    body: { password },
    expectedStatus: [200]
  }).catch(() => undefined);

  console.log("[smoke] complete");
}

run().catch((error) => {
  console.error("[smoke] failed", {
    message: error?.message || String(error),
    response: error?.response || null
  });
  process.exitCode = 1;
});

