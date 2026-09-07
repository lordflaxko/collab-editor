import type { SyntaxNode } from '@lezer/common'
import { languageById } from './languages'

export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'struct'
  | 'enum'
  | 'trait'
  | 'interface'
  | 'type'
  | 'variable'
  | 'constant'
  | 'field'

// CodeMirror's completion popup renders an icon keyed off this string (its
// base theme only styles a fixed set of these -- anything else falls back to
// no icon), so kinds without a close match (struct, trait) borrow the
// nearest visually-similar one rather than getting an unstyled entry.
const COMPLETION_TYPE: Record<SymbolKind, string> = {
  function: 'function',
  method: 'method',
  class: 'class',
  struct: 'class',
  enum: 'enum',
  trait: 'interface',
  interface: 'interface',
  type: 'type',
  variable: 'variable',
  constant: 'constant',
  field: 'property',
}

export function completionTypeFor(kind: SymbolKind): string {
  return COMPLETION_TYPE[kind]
}

export interface FileSymbol {
  name: string
  kind: SymbolKind
  from: number
  line: number
}

export interface ProjectSymbol extends FileSymbol {
  fileId: string
  fileName: string
}

interface SymbolRule {
  container: string
  // Alternative direct-child paths to the identifier node, tried in order.
  // Each path step is resolved via SyntaxNode.getChild, so it only ever
  // matches a *direct* child -- this is what keeps a function's own name
  // from being confused with a same-named node buried in its parameter list
  // or body.
  namePaths: string[][]
  kind: SymbolKind
}

// Verified against each language's actual Lezer grammar (via
// @codemirror/lang-*, the same parsers the editor already loads for syntax
// highlighting) rather than guessed from documentation -- grammar node names
// are not standardized across languages and differ in surprising ways (e.g.
// Java and Go both call a declaration's own name node something distinct
// from an identical-looking parameter name one level deeper).
const RULES: Record<string, SymbolRule[]> = {
  javascript: [
    { container: 'FunctionDeclaration', namePaths: [['VariableDefinition']], kind: 'function' },
    { container: 'ClassDeclaration', namePaths: [['VariableDefinition']], kind: 'class' },
    { container: 'MethodDeclaration', namePaths: [['PropertyDefinition']], kind: 'method' },
    { container: 'VariableDeclaration', namePaths: [['VariableDefinition']], kind: 'variable' },
  ],
  python: [
    { container: 'FunctionDefinition', namePaths: [['VariableName']], kind: 'function' },
    { container: 'ClassDefinition', namePaths: [['VariableName']], kind: 'class' },
    { container: 'AssignStatement', namePaths: [['VariableName']], kind: 'variable' },
  ],
  java: [
    { container: 'ClassDeclaration', namePaths: [['Definition']], kind: 'class' },
    { container: 'InterfaceDeclaration', namePaths: [['Definition']], kind: 'interface' },
    { container: 'MethodDeclaration', namePaths: [['Definition']], kind: 'method' },
    { container: 'FieldDeclaration', namePaths: [['VariableDeclarator', 'Definition']], kind: 'field' },
  ],
  cpp: [
    {
      container: 'FunctionDefinition',
      namePaths: [['FunctionDeclarator', 'Identifier'], ['FunctionDeclarator', 'FieldIdentifier']],
      kind: 'function',
    },
    { container: 'ClassSpecifier', namePaths: [['TypeIdentifier']], kind: 'class' },
    { container: 'StructSpecifier', namePaths: [['TypeIdentifier']], kind: 'struct' },
    { container: 'FieldDeclaration', namePaths: [['FieldIdentifier']], kind: 'field' },
    { container: 'Declaration', namePaths: [['InitDeclarator', 'Identifier'], ['Identifier']], kind: 'variable' },
  ],
  rust: [
    { container: 'FunctionItem', namePaths: [['BoundIdentifier']], kind: 'function' },
    { container: 'StructItem', namePaths: [['TypeIdentifier']], kind: 'struct' },
    { container: 'EnumItem', namePaths: [['TypeIdentifier']], kind: 'enum' },
    { container: 'TraitItem', namePaths: [['TypeIdentifier']], kind: 'trait' },
    { container: 'ConstItem', namePaths: [['BoundIdentifier']], kind: 'constant' },
    { container: 'LetDeclaration', namePaths: [['BoundIdentifier']], kind: 'variable' },
  ],
  go: [
    { container: 'FunctionDecl', namePaths: [['DefName']], kind: 'function' },
    { container: 'MethodDecl', namePaths: [['FieldName']], kind: 'method' },
    { container: 'TypeSpec', namePaths: [['DefName']], kind: 'type' },
    { container: 'VarSpec', namePaths: [['DefName']], kind: 'variable' },
    { container: 'ConstSpec', namePaths: [['DefName']], kind: 'constant' },
  ],
}
RULES.typescript = RULES.javascript

function resolvePath(node: SyntaxNode, path: string[]): SyntaxNode | null {
  let current: SyntaxNode | null = node
  for (const step of path) {
    current = current?.getChild(step) ?? null
    if (!current) return null
  }
  return current
}

export function extractSymbols(languageId: string, code: string): FileSymbol[] {
  const rules = RULES[languageId]
  if (!rules) return []
  const parser = languageById(languageId).cm().language.parser
  const tree = parser.parse(code)
  const symbols: FileSymbol[] = []

  tree.iterate({
    enter: (node) => {
      for (const rule of rules) {
        if (node.type.name !== rule.container) continue
        for (const path of rule.namePaths) {
          const nameNode = resolvePath(node.node, path)
          if (nameNode) {
            symbols.push({
              name: code.slice(nameNode.from, nameNode.to),
              kind: rule.kind,
              from: nameNode.from,
              line: code.slice(0, nameNode.from).split('\n').length,
            })
            break
          }
        }
      }
    },
  })

  return symbols
}

export function buildProjectSymbolIndex(
  files: { id: string; name: string; languageId: string; content: string }[],
): ProjectSymbol[] {
  const result: ProjectSymbol[] = []
  for (const file of files) {
    for (const symbol of extractSymbols(file.languageId, file.content)) {
      result.push({ ...symbol, fileId: file.id, fileName: file.name })
    }
  }
  return result
}
