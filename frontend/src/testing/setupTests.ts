import "@testing-library/jest-dom";

// mock Global Fetch (Casting the partial object as a full Response)
global.fetch = jest.fn().mockImplementation(
  () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve("{}"),
      headers: new Headers(),
    } as Response), // cast for TypeScript
);

// mock Global WebSocket
global.WebSocket = jest.fn().mockImplementation(() => ({
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  binaryType: "blob",
  bufferedAmount: 0,
  extensions: "",
  protocol: "",
  readyState: 0,
  url: "",
})) as unknown as typeof WebSocket;

// mock Electron window object safely
window.electron = {
  ipcRenderer: {
    send: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
  },
};
