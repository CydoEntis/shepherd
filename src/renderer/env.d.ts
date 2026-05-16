declare module '*.png' {
  const url: string
  export default url
}

declare module 'monaco-themes/themes/*.json' {
  const data: {
    base: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'
    inherit: boolean
    rules: Array<{ token: string; foreground?: string; background?: string; fontStyle?: string }>
    colors: Record<string, string>
    encodedTokensColors?: string[]
  }
  export default data
}
