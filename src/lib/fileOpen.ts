import type { OpenedTxt } from '../types';
import { idbDelete, idbGet, idbPut } from './storage';

interface PickerWindow {
  showOpenFilePicker?: (options?: {
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    multiple?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
}

export function supportsFilePicker(): boolean {
  return typeof (window as unknown as PickerWindow).showOpenFilePicker === 'function';
}

export async function pickTxtWithPicker(): Promise<OpenedTxt | null> {
  const picker = (window as unknown as PickerWindow).showOpenFilePicker;
  if (!picker) return null;
  try {
    const [handle] = await picker.call(window, {
      types: [{ description: 'TXT 小说文件', accept: { 'text/plain': ['.txt'] } }],
      multiple: false,
    });
    const file = await handle.getFile();
    return { file, handle };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}

export function bookIdOf(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

export async function saveHandle(id: string, handle: FileSystemFileHandle | null): Promise<void> {
  if (handle) {
    await idbPut('handles', { id, handle });
  } else {
    await idbDelete('handles', id);
  }
}

export async function getSavedHandle(id: string): Promise<FileSystemFileHandle | null> {
  const rec = await idbGet<{ id: string; handle: FileSystemFileHandle }>('handles', id);
  return rec?.handle ?? null;
}

interface PermissionHandle {
  queryPermission?: (descriptor: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'read' }) => Promise<PermissionState>;
}

/** 通过 File System Access API 重新打开已保存的书，失败返回 null（用户可重新选择文件）。 */
export async function openSavedFile(id: string): Promise<File | null> {
  const handle = await getSavedHandle(id);
  if (!handle) return null;
  try {
    const permHandle = handle as FileSystemFileHandle & PermissionHandle;
    let permission = (await permHandle.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (permission !== 'granted') {
      permission = (await permHandle.requestPermission?.({ mode: 'read' })) ?? 'denied';
    }
    if (permission !== 'granted') return null;
    return await handle.getFile();
  } catch {
    return null;
  }
}
