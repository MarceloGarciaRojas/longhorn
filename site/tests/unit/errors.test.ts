import assert from "node:assert/strict";
import test from "node:test";

import {
  toErrorResponse,
  ValidationError,
} from "../../src/errors/app-error";
import { createLogger } from "../../src/observability/logger";

function testLogger(lines: string[]) {
  return createLogger(
    {
      environment: "test",
      service: "nexi-web",
      correlationId: "error-test",
      minimumLevel: "debug",
    },
    (line) => lines.push(line),
  );
}

test("returns a controlled validation error", async () => {
  const lines: string[] = [];
  const response = toErrorResponse({
    error: new ValidationError("Dato inválido."),
    correlationId: "error-test",
    logger: testLogger(lines),
  });

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("x-correlation-id"), "error-test");
  assert.deepEqual(await response.json(), {
    error: {
      code: "VALIDATION_ERROR",
      message: "Dato inválido.",
      correlation_id: "error-test",
    },
  });
  assert.equal(lines.length, 1);
});

test("does not expose unexpected error details", async () => {
  const lines: string[] = [];
  const response = toErrorResponse({
    error: new Error("sensitive internal detail"),
    correlationId: "error-test",
    logger: testLogger(lines),
  });
  const body = JSON.stringify(await response.json());

  assert.equal(response.status, 500);
  assert.match(body, /INTERNAL_ERROR/);
  assert.doesNotMatch(body, /sensitive internal detail/);
  assert.doesNotMatch(lines[0], /sensitive internal detail/);
});
