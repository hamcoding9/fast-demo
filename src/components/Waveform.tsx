const heights = [18, 30, 22, 46, 34, 58, 26, 42, 62, 38, 24, 48, 68, 40, 54, 28, 44, 60, 32, 20, 38, 52, 26, 42, 30, 16, 28, 40, 22, 12]
export function Waveform() {
  return <div aria-hidden="true" className="flex h-20 items-center justify-center gap-1.5 overflow-hidden">{heights.map((height, index) => <span key={index} className="w-1.5 shrink-0 rounded-full bg-indigo-300" style={{ height }} />)}</div>
}
