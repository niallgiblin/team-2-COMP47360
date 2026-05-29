import { routeSegmentCache } from '../utils/routeSegmentCache';

let registeredBusynessClear = null;
let registeredAuthLogout = null;
const moduleCacheClears = [];

export function registerBusynessClear(fn) {
  registeredBusynessClear = fn;
}

export function registerAuthLogout(fn) {
  registeredAuthLogout = fn;
}

export function invokeAuthLogout() {
  if (typeof registeredAuthLogout === 'function') {
    registeredAuthLogout();
    return true;
  }
  return false;
}

export function registerModuleCacheClear(fn) {
  if (typeof fn === 'function' && !moduleCacheClears.includes(fn)) {
    moduleCacheClears.push(fn);
  }
}

export function invalidateClientCaches({ clearBusyness } = {}) {
  const clearFn = clearBusyness ?? registeredBusynessClear;
  if (typeof clearFn === 'function') {
    clearFn();
  }

  moduleCacheClears.forEach((clear) => clear());

  routeSegmentCache.clear();

  if (typeof window !== 'undefined' && window.venueBusynessFetchPromise) {
    window.venueBusynessFetchPromise = null;
  }
}
