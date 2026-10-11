type IconName = 'play' | 'pause' | 'close' | 'record' | 'wave' | 'headphones'
const paths: Record<IconName, string> = {
  play: 'm9 5 11 7-11 7V5Z',
  pause: 'M8 5v14M16 5v14',
  close: 'm6 6 12 12M18 6 6 18',
  record: 'M12 15a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v7a3 3 0 0 0 3 3ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',
  wave: 'M4 9v6M8 5v14M12 2v20M16 6v12M20 9v6',
  headphones: 'M3 14v-3a9 9 0 0 1 18 0v3M3 13h3v8H3v-8ZM18 13h3v8h-3v-8Z',
}
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`size-6 ${className}`}><path d={paths[name]} /></svg>
}
