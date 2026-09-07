import { useEffect } from 'react'

// Shared by every popover (comment, explain, breakpoint, save-as-template)
// so pressing Escape dismisses whichever one is open, matching the standard
// expectation set by virtually every other modal/popover UI.
export function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])
}
