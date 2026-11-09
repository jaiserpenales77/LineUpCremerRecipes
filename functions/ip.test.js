const test = require("node:test");
const assert = require("node:assert");
const { clientIp, isAllowed } = require("./ip");

const req = (xff, ip) => ({ headers: xff == null ? {} : { "x-forwarded-for": xff }, ip });

test("trusts only the last X-Forwarded-For entry (the one Google adds)", () => {
  assert.equal(clientIp(req("198.51.100.9")), "198.51.100.9");
  // a caller pretending to be on the plant network: their real address is last
  assert.equal(clientIp(req("203.0.113.7, 198.51.100.9")), "198.51.100.9");
  assert.equal(clientIp(req(null, "127.0.0.1")), "127.0.0.1");
});

test("matches single addresses and ranges, IPv4 and IPv6", () => {
  const list = ["203.0.113.7", "192.0.2.0/24", "2001:db8:1234::/48", "  198.51.100.20 "];
  assert.ok(isAllowed("203.0.113.7", list));
  assert.ok(isAllowed("192.0.2.200", list));
  assert.ok(isAllowed("198.51.100.20", list));
  assert.ok(isAllowed("2001:db8:1234:5::9", list));
  assert.ok(isAllowed("::ffff:203.0.113.7", list), "IPv4 written as IPv6");
  assert.ok(!isAllowed("203.0.113.8", list));
  assert.ok(!isAllowed("192.0.3.1", list));
  assert.ok(!isAllowed("2001:db8:1235::1", list));
});

test("refuses everything when the list is empty, missing or unreadable", () => {
  assert.ok(!isAllowed("203.0.113.7", []));
  assert.ok(!isAllowed("203.0.113.7", null));
  assert.ok(!isAllowed("203.0.113.7", ["not an ip", "1.2.3.4/99"]));
  assert.ok(!isAllowed("", ["0.0.0.0/0"]));
  assert.ok(!isAllowed("garbage", ["0.0.0.0/0"]));
});
