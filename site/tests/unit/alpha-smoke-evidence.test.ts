import assert from "node:assert/strict";
import test from "node:test";

import {
  ALPHA_RESTAURANT_SMOKE_ROUTES,
  validateAlphaSmokeEvidence,
} from "../../src/alpha/smoke-evidence";

const SHA = "a".repeat(40);

function validEvidence() {
  return {
    commitSha: SHA,
    source: "cloudflare-workers-logs-and-e2e",
    routes: Object.fromEntries(
      ALPHA_RESTAURANT_SMOKE_ROUTES.map((route) => [
        route,
        {
          httpStatus: 200,
          cpuTimeMs: 9.9,
          outcome: "ok",
          throttled: false,
          errorCode: null as number | null,
        },
      ]),
    ),
    consistency: {
      readAfterWriteObserved: true,
      revokedSessionRejected: true,
      revokedPermissionRejected: true,
    },
  };
}

test("alpha smoke accepts exact-SHA Restaurant evidence within Workers Free CPU", () => {
  assert.equal(validateAlphaSmokeEvidence(validEvidence(), SHA).commitSha, SHA);
});

test("alpha smoke rejects stale reads and ineffective revocation", () => {
  for (const check of [
    "readAfterWriteObserved",
    "revokedSessionRejected",
    "revokedPermissionRejected",
  ] as const) {
    const evidence = validEvidence();
    evidence.consistency[check] = false;
    assert.throws(() => validateAlphaSmokeEvidence(evidence, SHA), new RegExp(check));
  }
});

test("alpha smoke rejects CPU overruns, throttling, missing routes and wrong SHA", () => {
  const cpu = validEvidence();
  cpu.routes.preview.cpuTimeMs = 10.1;
  assert.throws(() => validateAlphaSmokeEvidence(cpu, SHA), /exceeded Workers Free CPU/);

  const throttled = validEvidence();
  throttled.routes.publication.outcome = "exceededCpu";
  throttled.routes.publication.throttled = true;
  throttled.routes.publication.errorCode = 1102;
  assert.throws(() => validateAlphaSmokeEvidence(throttled, SHA), /throttled/);

  const missing = validEvidence();
  delete (missing.routes as Partial<typeof missing.routes>)["content-edit"];
  assert.throws(() => validateAlphaSmokeEvidence(missing, SHA), /JSON object/);

  assert.throws(() => validateAlphaSmokeEvidence(validEvidence(), "b".repeat(40)), /commit/);
});
