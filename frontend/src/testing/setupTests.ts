import "@testing-library/jest-dom";

// 1. Mock Global Fetch (Casting the partial object as a full Response)
global.fetch = jest.fn().mockImplementation(
  () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve("{}"),
      headers: new Headers(),
    } as Response), // <--- This cast tells TypeScript "trust me, this acts like a Response"
);

// 2. Mock Global WebSocket
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
})) as unknown as typeof WebSocket; // <--- Double cast to force TypeScript to accept it

// 3. Mock Electron window object safely
window.electron = {
  ipcRenderer: {
    send: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
  },
};
