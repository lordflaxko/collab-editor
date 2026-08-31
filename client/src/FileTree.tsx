import { useState, type FormEvent } from 'react'
import type { FileMeta } from './useFileTree'

interface FileTreeProps {
  files: FileMeta[]
  activeId: string | null
  readOnly: boolean
  onSelect: (id: string) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

function FileTree({ files, activeId, readOnly, onSelect, onCreate, onRename, onDelete }: FileTreeProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  function submitCreate(e: FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    onCreate(name)
    setNewName('')
    setCreating(false)
  }

  function startRename(file: FileMeta) {
    setRenamingId(file.id)
    setRenameValue(file.name)
  }

  function submitRename(e: FormEvent) {
    e.preventDefault()
    const name = renameValue.trim()
    if (name && renamingId) onRename(renamingId, name)
    setRenamingId(null)
  }

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span>Files</span>
        {!readOnly && (
          <button type="button" className="btn btn-small" onClick={() => setCreating(true)}>
            + New
          </button>
        )}
      </div>
      {!readOnly && creating && (
        <form className="file-tree-new" onSubmit={submitCreate}>
          <input
            className="text-input"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => !newName && setCreating(false)}
            placeholder="filename.ext"
          />
        </form>
      )}
      <ul className="file-tree-list">
        {files.map((file) => (
          <li key={file.id} className={file.id === activeId ? 'is-active' : ''}>
            {renamingId === file.id ? (
              <form onSubmit={submitRename}>
                <input
                  className="text-input"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={submitRename}
                />
              </form>
            ) : (
              <>
                <button
                  type="button"
                  className="file-tree-item"
                  onClick={() => onSelect(file.id)}
                  onDoubleClick={readOnly ? undefined : () => startRename(file)}
                  title={readOnly ? undefined : 'Double-click to rename'}
                >
                  {file.name}
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    className="file-tree-delete"
                    title="Delete file"
                    onClick={() => {
                      if (files.length <= 1) return
                      if (window.confirm(`Delete ${file.name}?`)) onDelete(file.id)
                    }}
                  >
                    ×
                  </button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default FileTree
