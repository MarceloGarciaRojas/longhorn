import assert from "node:assert/strict";
import test from "node:test";

import { GET } from "../../app/api/health/route";

test("health endpoint returns only safe operational metadata", async () => {
  const response = await GET(
    new Request("http://localhost:3000/api/health", {
      headers: { "x-correlation-id": "health-integration-test" },
    }),
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(
    response.headers.get("x-correlation-id"),
    "health-integration-test",
  );
  assert.equal(body.status, "ok");
  assert.equal(body.application, "nexi");
  assert.equal(typeof body.timestamp, "string");
  assert.equal(typeof body.uptime_seconds, "number");

  const serialized = JSON.stringify(body).toLowerCase();
  for (const forbidden of [
    "password",
    "secret",
    "cookie",
    "database_url",
    "api_key",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden));
  }
});

test("health endpoint replaces an invalid correlation id", async () => {
  const response = await GET(
    new Request("http://localhost:3000/api/health", {
      headers: { "x-correlation-id": "invalid correlation id" },
    }),
  );
  const correlationId = response.headers.get("x-correlation-id") ?? "";

  assert.equal(response.status, 200);
  assert.notEqual(correlationId, "invalid correlation id");
  assert.match(correlationId, /^[0-9a-f-]{36}$/i);
});
