import assert from "node:assert/strict";
import test from "node:test";

import { createLogger } from "../../src/observability/logger";

test("emits structured logs and redacts sensitive fields", () => {
  const lines: string[] = [];
  const logger = createLogger(
    {
      environment: "test",
      service: "nexi-web",
      correlationId: "test-correlation",
      minimumLevel: "debug",
    },
    (line) => lines.push(line),
  );

  logger.info("configuration_loaded", {
    result: "success",
    user_id: "safe-user-id",
    password: "must-not-appear",
    nested: { access_token: "must-not-appear-either" },
  });

  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(entry.level, "info");
  assert.equal(entry.environment, "test");
  assert.equal(entry.service, "nexi-web");
  assert.equal(entry.correlation_id, "test-correlation");
  assert.equal(entry.password, "[REDACTED]");
  assert.deepEqual(entry.nested, { access_token: "[REDACTED]" });
  assert.doesNotMatch(lines[0], /must-not-appear/);
});

test("filters messages below the configured minimum level", () => {
  const lines: string[] = [];
  const logger = createLogger(
    {
      environment: "test",
      service: "nexi-web",
      minimumLevel: "warn",
    },
    (line) => lines.push(line),
  );

  logger.debug("ignored");
  logger.info("ignored");
  logger.warn("recorded", { result: "warning" });

  assert.equal(lines.length, 1);
  assert.match(lines[0], /recorded/);
});
