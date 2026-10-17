export interface Group {
  id: string
  name: string
  isActive: boolean
}

export type GroupState =
  | { status: 'missing' | 'invalid' | 'loading' | 'not-found' | 'inactive' }
  | { status: 'error'; message: string }
  | { status: 'ready'; group: Group }
