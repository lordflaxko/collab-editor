// A CSS border-triangle renders fine at large sizes but doesn't anti-alias
// cleanly at the ~8-10px this is used at inline with button text -- the left
// corners come out visibly rounded instead of sharp. An SVG path has no such
// problem since it's rendered as an actual vector shape at any size.
export function PlayIcon({ size = 10 }: { size?: number }) {
  return (
    <svg
      className="icon-play"
      width={size}
      height={size}
      viewBox="0 0 10 10"
      aria-hidden="true"
      focusable="false"
    >
      <polygon points="0,0 10,5 0,10" fill="currentColor" shapeRendering="crispEdges" />
    </svg>
  )
}
