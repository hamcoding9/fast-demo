import type { GroupState } from '../types/group'

const messages = {
  missing: 'Open a group link with a Group ID, for example /?groupId=group-a. Cloud access is unavailable until a group is verified.',
  invalid: 'Invalid Group ID. Use 1–128 letters, numbers, hyphens or underscores, starting with a letter or number.',
  loading: 'Loading group…',
  'not-found': 'This group does not exist. Check your group link.',
  inactive: 'This group is inactive. Contact the project organizer.',
}

export function GroupStatus({ state, onRetry }: { state: GroupState; onRetry: () => void }) {
  return <div className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
    <p role={state.status === 'error' ? 'alert' : 'status'}>
      {state.status === 'ready' ? <>Group: <strong>{state.group.name}</strong></>
        : state.status === 'error' ? state.message : messages[state.status]}
    </p>
    {state.status === 'error' && <button type="button" onClick={onRetry} className="mt-2 min-h-11 font-semibold text-indigo-700">Retry group lookup</button>}
  </div>
}
