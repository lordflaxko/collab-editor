import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export interface TerminalHandle {
  write: (text: string) => void
  clear: () => void
}

interface TerminalViewProps {
  isDark: boolean
  onData: (data: string) => void
}

// xterm.js wants literal colors, not CSS variables -- reading the live
// custom properties here (rather than hardcoding two palettes) means the
// terminal always matches whatever theme is actually active, including a
// future palette change, without this file needing to know the colors.
function themeFor(isDark: boolean) {
  const style = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    background: v('--bg', isDark ? '#211d1a' : '#ffffff'),
    foreground: v('--text-h', isDark ? '#f5f1ea' : '#2b2521'),
    cursor: v('--accent', '#eb6e86'),
    selectionBackground: v('--accent-bg', 'rgba(235, 110, 134, 0.2)'),
  }
}

// A thin wrapper around xterm.js -- the actual read/write protocol (what
// bytes mean what) lives in RunPanel, which owns the WebSocket. This only
// renders whatever it's told to and reports raw keystrokes back up.
const TerminalView = forwardRef<TerminalHandle, TerminalViewProps>(function TerminalView(
  { isDark, onData },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  // onData is recreated every render (it closes over RunPanel's state), but
  // the terminal itself should only be constructed once -- routed through a
  // ref so the live callback is used without that effect depending on it.
  const onDataRef = useRef(onData)

  useEffect(() => {
    onDataRef.current = onData
  }, [onData])

  useEffect(() => {
    if (!containerRef.current) return
    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, Consolas, monospace',
      cursorBlink: true,
      theme: themeFor(isDark),
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()
    term.onData((data) => onDataRef.current(data))
    termRef.current = term

    const refit = () => fitAddon.fit()
    window.addEventListener('resize', refit)
    const resizeObserver = new ResizeObserver(refit)
    resizeObserver.observe(containerRef.current)

    return () => {
      window.removeEventListener('resize', refit)
      resizeObserver.disconnect()
      term.dispose()
      termRef.current = null
    }
    // Intentionally created once -- isDark changes are applied to the
    // existing instance below instead of tearing down the terminal (which
    // would wipe its scrollback) just because the theme toggled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = themeFor(isDark)
  }, [isDark])

  useImperativeHandle(ref, () => ({
    write: (text) => termRef.current?.write(text),
    clear: () => termRef.current?.clear(),
  }))

  return <div className="terminal-view" ref={containerRef} />
})

export default TerminalView
