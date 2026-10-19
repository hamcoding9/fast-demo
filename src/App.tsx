import { GroupStatus } from './components/GroupStatus'
import { useGroup } from './hooks/useGroup'
import { BottomNavigation } from './components/BottomNavigation'
import { Icon } from './components/Icon'
import { useNavigation } from './hooks/useNavigation'
import { PlayPage } from './pages/PlayPage'
import { RecordPage } from './pages/RecordPage'

export default function App() {
  const { activePage, navigate } = useNavigation()
  const { state: groupState, retry, scopeKey } = useGroup()
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between border-b border-slate-200 py-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white"><Icon name="wave" /></span>
          <span className="text-xl font-extrabold tracking-tight">FAST</span>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-5xl py-10 sm:py-14">
        <GroupStatus state={groupState} onRetry={retry} />
        <div key={scopeKey}>{activePage === 'play' ? <PlayPage groupId={groupState.status === 'ready' ? groupState.group.id : null} /> : <RecordPage groupId={groupState.status === 'ready' ? groupState.group.id : null} />}</div>
      </main>
      <BottomNavigation activePage={activePage} onNavigate={navigate} />
    </div>
  )
}
