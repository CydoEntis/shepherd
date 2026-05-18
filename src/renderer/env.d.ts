declare module '*.png' {
  const url: string
  export default url
}

interface Window {
  electronWebUtils: {
    getPathForFile(file: File): string
  }
}
