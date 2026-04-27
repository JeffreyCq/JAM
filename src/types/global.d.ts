export {}

declare global {
  interface Window {
    electronAPI?: {
      openFile: () => Promise<string | null>
      saveFile: (content: string, name?: string) => Promise<boolean>
      onFileOpen: (cb: (content: string, filePath: string) => void) => () => void
    }
    MonacoEnvironment?: {
      getWorker: (moduleId: string, label: string) => Worker
    }
  }
}
