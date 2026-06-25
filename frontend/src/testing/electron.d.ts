export {};

interface ElectronBridge {
  ipcRenderer: {
    send: jest.Mock | ((channel: string, ...args: unknown[]) => void);
    on:
      | jest.Mock
      | ((channel: string, func: (...args: unknown[]) => void) => void);
    once:
      | jest.Mock
      | ((channel: string, func: (...args: unknown[]) => void) => void);
    removeListener:
      | jest.Mock
      | ((channel: string, func: (...args: unknown[]) => void) => void);
  };
}

declare global {
  interface Window {
    electron: ElectronBridge;
  }
}
