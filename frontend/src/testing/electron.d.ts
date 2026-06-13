export {};

interface ElectronBridge {
  ipcRenderer: {
    send: jest.Mock | ((channel: string, ...args: any[]) => void);
    on: jest.Mock | ((channel: string, func: (...args: any[]) => void) => void);
    once:
      | jest.Mock
      | ((channel: string, func: (...args: any[]) => void) => void);
    removeListener:
      | jest.Mock
      | ((channel: string, func: (...args: any[]) => void) => void);
  };
}

declare global {
  interface Window {
    electron: ElectronBridge;
  }
}
