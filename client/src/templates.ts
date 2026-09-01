export interface ProjectTemplate {
  id: string
  label: string
}

// Ids here must match the keys in server/templates.js -- "blank" is handled
// specially server-side (falls back to the single empty main.js this app
// has always started projects with) rather than being a real template entry.
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  { id: 'blank', label: 'Blank' },
  { id: 'javascript', label: 'JavaScript: FizzBuzz starter' },
  { id: 'typescript', label: 'TypeScript: FizzBuzz starter' },
  { id: 'python', label: 'Python: FizzBuzz starter' },
  { id: 'java', label: 'Java: FizzBuzz starter' },
  { id: 'cpp', label: 'C++: FizzBuzz starter' },
  { id: 'rust', label: 'Rust: FizzBuzz starter' },
  { id: 'go', label: 'Go: FizzBuzz starter' },
]
