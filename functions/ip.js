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

// The networks allowed now, from LineUp's document jde-sched-access/network:
// the console's permanent list (allowed) and the networks Owners allowed from
// the Hub (temporary: [{ ip, until }]) that haven't run out. LineUp's
// `enabled` switch is ignored on purpose: with the check off LineUp still has
// its shift passwords, but Cremer Recipes would be open to anyone.
function allowedNow(settings, now = Date.now()) {
  const temporary = (Array.isArray(settings && settings.temporary) ? settings.temporary : [])
    .filter(t => t && typeof t.ip === "string" && t.until && typeof t.until.toMillis === "function" && t.until.toMillis() > now)
    .map(t => t.ip);
  return [...(Array.isArray(settings && settings.allowed) ? settings.allowed : []), ...temporary];
}

module.exports = { clientIp, isAllowed, allowedNow };
