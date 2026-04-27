import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (): Promise<string | null> =>
    ipcRenderer.invoke('open-file'),

  saveFile: (content: string, name?: string): Promise<boolean> =>
    ipcRenderer.invoke('save-file', content, name),

  onFileOpen: (cb: (content: string, filePath: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, content: string, filePath: string) =>
      cb(content, filePath)
    ipcRenderer.on('file-opened', handler)
    return () => ipcRenderer.removeListener('file-opened', handler)
  }
})
