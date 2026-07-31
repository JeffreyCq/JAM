export {}

declare global {
  interface OpenedFile {
    path: string
    name: string
    content: string
  }

  interface Window {
    electronAPI?: {
      platform: string
      openFile: () => Promise<OpenedFile[] | null>
      readFile: (filePath: string) => Promise<OpenedFile | null>
      saveFile: (content: string, filePath?: string | null, name?: string) => Promise<{ path: string } | null>
      onFileOpen: (cb: (content: string, filePath: string) => void) => () => void
    }
    MonacoEnvironment?: {
      getWorker: (moduleId: string, label: string) => Worker
    }
  }
}
