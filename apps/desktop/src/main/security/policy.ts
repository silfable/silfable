import type { IpcMainInvokeEvent, WebContents } from "electron";

export const HARDENED_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  webviewTag: false,
  allowRunningInsecureContent: false,
  navigateOnDragDrop: false,
} as const);

export function denyWindowOpen(): { action: "deny" } {
  return { action: "deny" };
}

export function preventRendererNavigation(event: { preventDefault(): void }): void {
  event.preventDefault();
}

export function denyPermissionCheck(): false {
  return false;
}

export function denyPermissionRequest(
  _webContents: unknown,
  _permission: unknown,
  callback: (allowed: boolean) => void,
): void {
  callback(false);
}

export function assertTrustedIpcEvent(
  event: Pick<IpcMainInvokeEvent, "sender" | "senderFrame">,
  trusted: WebContents | null,
): void {
  if (
    trusted === null ||
    trusted.isDestroyed() ||
    event.sender !== trusted ||
    event.senderFrame !== trusted.mainFrame
  ) {
    throw new Error("Rejected IPC sender");
  }
}
