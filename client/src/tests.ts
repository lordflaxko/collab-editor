import { postJson } from './api'

export interface TestResult {
  id: number
  name: string
  passed: boolean
}

export interface TestFileResult {
  file: string
  tests: TestResult[]
  passed: number
  failed: number
  stderr: string
  exitCode: number | null
}

export function runTests(room: string): Promise<{ results: TestFileResult[] }> {
  return postJson('/tests/run', { room })
}
