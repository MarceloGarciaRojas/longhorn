import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPublicHost,
  normalizeHostname,
} from "../../src/tenancy/public-host";

test("public host classification normalizes but does not grant tenant authority", () => {
  assert.deepEqual(classifyPublicHost("NEXI.CL:443", ["nexi.cl"]), {
    kind: "platform",
    hostname: "nexi.cl",
  });
  assert.deepEqual(classifyPublicHost("cliente.nexi.cl", ["nexi.cl"]), {
    kind: "site_candidate",
    hostname: "cliente.nexi.cl",
  });
});

test("invalid, local and non-domain hosts fail closed", () => {
  assert.equal(normalizeHostname("localhost:3000"), null);
  assert.equal(normalizeHostname("127.0.0.1"), null);
  assert.equal(normalizeHostname("bad host.example"), null);
});
