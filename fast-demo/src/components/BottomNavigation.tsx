import type { Page } from '../types/navigation'
import { Icon } from './Icon'

interface Props { activePage: Page; onNavigate: (page: Page) => void }
export function BottomNavigation({ activePage, onNavigate }: Props) {
  return (
    <nav aria-label="메인 내비게이션" className="bottom-navigation fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur-lg">
      <div className="mx-auto grid max-w-md grid-cols-2 gap-2 px-4 pt-3">
        {(['play', 'record'] as const).map((page) => (
          <button key={page} type="button" aria-current={activePage === page ? 'page' : undefined} onClick={() => onNavigate(page)} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-6 py-2 text-xs font-semibold transition-colors ${activePage === page ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
            <Icon name={page} />{page === 'play' ? 'Play' : 'Record'}
          </button>
        ))}
      </div>
    </nav>
  )
}
