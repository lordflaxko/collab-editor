import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { go } from '@codemirror/lang-go'
import { cpp } from '@codemirror/lang-cpp'
import { java } from '@codemirror/lang-java'
import type { LanguageSupport } from '@codemirror/language'

export interface LanguageConfig {
  id: string
  label: string
  extension: string
  cm: () => LanguageSupport
  piston: { language: string; version: string }
  /** Prettier parser name, for languages Prettier can format entirely in the browser. */
  prettierParser?: string
  /** Formatted server-side (currently: Python via Black). */
  serverFormat?: boolean
}

export const LANGUAGES: LanguageConfig[] = [
  {
    id: 'javascript',
    label: 'JavaScript',
    extension: '.js',
    cm: () => javascript(),
    piston: { language: 'javascript', version: '18.15.0' },
    prettierParser: 'babel',
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    extension: '.ts',
    cm: () => javascript({ typescript: true }),
    piston: { language: 'typescript', version: '5.0.3' },
    prettierParser: 'typescript',
  },
  {
    id: 'python',
    label: 'Python',
    extension: '.py',
    cm: () => python(),
    piston: { language: 'python', version: '3.10.0' },
    serverFormat: true,
  },
  {
    id: 'java',
    label: 'Java',
    extension: '.java',
    cm: () => java(),
    piston: { language: 'java', version: '15.0.2' },
  },
  {
    id: 'cpp',
    label: 'C++',
    extension: '.cpp',
    cm: () => cpp(),
    piston: { language: 'c++', version: '10.2.0' },
  },
  {
    id: 'rust',
    label: 'Rust',
    extension: '.rs',
    cm: () => rust(),
    piston: { language: 'rust', version: '1.68.2' },
  },
  {
    id: 'go',
    label: 'Go',
    extension: '.go',
    cm: () => go(),
    piston: { language: 'go', version: '1.16.2' },
  },
]

export function languageFromFilename(name: string): LanguageConfig {
  const dot = name.lastIndexOf('.')
  const ext = dot === -1 ? '' : name.slice(dot)
  return LANGUAGES.find((lang) => lang.extension === ext) ?? LANGUAGES[0]
}

export function languageById(id: string): LanguageConfig {
  return LANGUAGES.find((lang) => lang.id === id) ?? LANGUAGES[0]
}
