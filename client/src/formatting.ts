import * as prettier from 'prettier/standalone'
import babelPlugin from 'prettier/plugins/babel'
import estreePlugin from 'prettier/plugins/estree'
import typescriptPlugin from 'prettier/plugins/typescript'
import type { LanguageConfig } from './languages'
import { SERVER_URL } from './api'

export function canFormat(language: LanguageConfig): boolean {
  return Boolean(language.prettierParser || language.serverFormat)
}

export async function formatCode(language: LanguageConfig, code: string): Promise<string> {
  if (language.prettierParser) {
    return prettier.format(code, {
      parser: language.prettierParser,
      plugins: [babelPlugin, estreePlugin, typescriptPlugin],
    })
  }

  if (language.serverFormat) {
    const response = await fetch(`${SERVER_URL}/format`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ languageId: language.id, code }),
    })
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error ?? 'Formatting failed')
    }
    return data.formatted as string
  }

  throw new Error(`No formatter available for ${language.label}`)
}
