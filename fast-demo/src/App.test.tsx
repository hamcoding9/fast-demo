import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('bottom navigation', () => {
  it('opens Play by default and displays disabled audio placeholders', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '나의 오디오' })).toBeInTheDocument()
    const navigation = screen.getByRole('navigation', { name: '메인 내비게이션' })
    expect(within(navigation).getByRole('button', { name: 'Play' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    screen.getAllByRole('button', { name: /재생 \(준비 중\)/ }).forEach((button) => expect(button).toBeDisabled())
  })

  it('switches Play → Record → Play and updates the current page', async () => {
    const user = userEvent.setup()
    render(<App />)
    const play = screen.getByRole('button', { name: 'Play' })
    const record = screen.getByRole('button', { name: 'Record' })
    await user.click(record)
    expect(screen.getByRole('heading', { name: '새로운 녹음' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '나의 오디오' })).not.toBeInTheDocument()
    expect(record).toHaveAttribute('aria-current', 'page')
    expect(play).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('button', { name: '녹음 시작 (준비 중)' })).toBeDisabled()
    await user.click(play)
    expect(screen.getByRole('heading', { name: '나의 오디오' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '새로운 녹음' })).not.toBeInTheDocument()
    expect(play).toHaveAttribute('aria-current', 'page')
    expect(record).not.toHaveAttribute('aria-current')
  })

  it('supports keyboard activation of both navigation buttons', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.tab() // Skip link
    await user.tab() // Play; disabled audio buttons are skipped
    expect(screen.getByRole('button', { name: 'Play' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Record' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('heading', { name: '새로운 녹음' })).toBeInTheDocument()
    await user.tab({ shift: true })
    await user.keyboard(' ')
    expect(screen.getByRole('heading', { name: '나의 오디오' })).toBeInTheDocument()
  })
})
