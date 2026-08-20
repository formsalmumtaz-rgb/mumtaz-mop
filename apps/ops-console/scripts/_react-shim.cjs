// React's cache() exists only inside a render. Proof scripts import domain
// modules that use it for request-level memoisation; outside a render the memo
// is meaningless, so it becomes the identity function. Nothing else is stubbed.
module.exports = { cache: (fn) => fn };
