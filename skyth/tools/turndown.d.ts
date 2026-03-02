declare module 'turndown' {
  interface TurndownOptions {
    headingStyle?: 'setext' | 'atx'
    codeBlockStyle?: 'fenced' | 'indented'
    bulletListMarker?: '-' | '*' | '+'
    emDelimiter?: '_' | '*'
    strongDelimiter?: '**' | '__'
    linkStyle?: 'inlined' | 'referenced'
    linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut'
    preformattedCode?: boolean
    quoteTemplate?: (blockquote: string, quotes: number) => string
    bulletListMarker?: string
    headingStyle?: string
  }

  interface TurndownService {
    use(plugin: (service: TurndownService) => void): void
    addRule(key: string, rule: any): void
    turndown(html: string): string
  }

  function Turndown(options?: TurndownOptions): TurndownService
  export = Turndown
}
