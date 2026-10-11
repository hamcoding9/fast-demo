import { BottomNavigation } from './components/BottomNavigation'
import { Icon } from './components/Icon'
import { useNavigation } from './hooks/useNavigation'
import { PlayPage } from './pages/PlayPage'
import { RecordPage } from './pages/RecordPage'

export default function App() {
  const { activePage, navigate } = useNavigation()
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">본문으로 건너뛰기</a>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between border-b border-slate-200 py-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white"><Icon name="wave" /></span>
          <span className="text-xl font-extrabold tracking-tight">FAST<span className="ml-3 hidden text-xs font-medium tracking-widest text-slate-500 sm:inline">AUDIO STUDIO</span></span>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">Audio Player · Step 03</span>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-5xl py-10 sm:py-14">
        {activePage === 'play' ? <PlayPage /> : <RecordPage />}
      </main>
      <BottomNavigation activePage={activePage} onNavigate={navigate} />
    </div>
  )
}
