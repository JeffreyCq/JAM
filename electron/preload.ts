import { contextBridge, ipcRenderer } from 'electron'

export interface OpenedFile {
  path: string
  name: string
  content: string
}

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  openFile: (): Promise<OpenedFile[] | null> =>
    ipcRenderer.invoke('open-file'),

  readFile: (filePath: string): Promise<OpenedFile | null> =>
    ipcRenderer.invoke('read-file', filePath),

  saveFile: (content: string, filePath?: string | null, name?: string): Promise<{ path: string } | null> =>
    ipcRenderer.invoke('save-file', content, filePath ?? null, name),

  onFileOpen: (cb: (content: string, filePath: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, content: string, filePath: string) =>
      cb(content, filePath)
    ipcRenderer.on('file-opened', handler)
    return () => ipcRenderer.removeListener('file-opened', handler)
  }
})
