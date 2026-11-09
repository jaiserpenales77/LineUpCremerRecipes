// IP address helpers for the plant-network check.
const ipaddr = require("ipaddr.js");

// The caller's address. Google's front end adds the address it received the
// request from to the END of X-Forwarded-For; anything before it was sent by
// the caller and can be made up, so only the last entry is trusted.
function clientIp(req) {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",").map(s => s.trim()).filter(Boolean);
  if (xff.length) return xff[xff.length - 1];
  return req.ip || (req.socket && req.socket.remoteAddress) || "";
}

function parse(ip) {
  try {
    let a = ipaddr.parse(String(ip).trim());
    if (a.kind() === "ipv6" && a.isIPv4MappedAddress()) a = a.toIPv4Address();
    return a;
  } catch {
    return null;
  }
}

// list: addresses ("203.0.113.7", "2001:db8::1") and ranges ("203.0.113.0/24",
// "2001:db8:1234::/48"). Anything unreadable in the list is ignored.
function isAllowed(ip, list) {
  const a = parse(ip);
  if (!a || !Array.isArray(list)) return false;
  return list.some(entry => {
    const e = String(entry).trim();
    try {
      if (e.includes("/")) {
        let [range, bits] = ipaddr.parseCIDR(e);
        if (range.kind() === "ipv6" && range.isIPv4MappedAddress() && bits >= 96) { range = range.toIPv4Address(); bits -= 96; }
        return range.kind() === a.kind() && a.match(range, bits);
      }
      const b = parse(e);
      return !!b && b.kind() === a.kind() && b.toNormalizedString() === a.toNormalizedString();
    } catch {
      return false;
    }
  });
}

module.exports = { clientIp, isAllowed };
