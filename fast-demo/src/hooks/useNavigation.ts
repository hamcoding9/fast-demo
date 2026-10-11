import { useState } from 'react'
import type { Page } from '../types/navigation'

export function useNavigation() {
  const [activePage, setActivePage] = useState<Page>('play')
  return { activePage, navigate: setActivePage }
}
