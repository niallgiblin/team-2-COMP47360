import '@testing-library/jest-dom';

if (typeof window !== 'undefined') {
  // Node 22+ may expose a broken localStorage without clear(); provide a full mock for tests.
  const storageMock = () => {
    let store = {};
    return {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => {
        store[key] = String(value);
      },
      removeItem: (key) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };
  };

  Object.defineProperty(window, 'localStorage', {
    value: storageMock(),
    configurable: true,
  });

  Object.defineProperty(window, 'sessionStorage', {
    value: storageMock(),
    configurable: true,
  });

  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || (() => {});
}

