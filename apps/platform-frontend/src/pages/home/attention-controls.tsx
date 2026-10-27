import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { updateAttention } from '@/service/api/home-api'
import type { HomeThread } from '@viberglass/types'
import { useState } from 'react'
import { toast } from 'sonner'

type Mode = 'waiting' | 'later'

/** A personal deferral leaves the task and its unanswered questions open. */
export function AttentionControls({ thread, onChanged, review = false }: { thread: HomeThread; onChanged: () => void; review?: boolean }) {
  const attention = thread.attention
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>(attention?.status === 'waiting' ? 'waiting' : 'later')
  const [reason, setReason] = useState(attention?.reason ?? '')
  const [when, setWhen] = useState(attention?.remindAt ? 'custom' : attention?.status === 'waiting' ? 'manual' : 'tomorrow')
  const [date, setDate] = useState(() => {
    if (!attention?.remindAt) return ''
    const time = new Date(attention.remindAt)
    return new Date(time.getTime() - time.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  })
  const [busy, setBusy] = useState(false)
  if (!attention) return null

  const update = async (next: 'acknowledged' | 'waiting' | 'later' | 'clear' | 'handled', remindAt?: string) => {
    setBusy(true)
    try {
      await updateAttention(thread.task.id, { source: attention.source, mode: next, reason, remindAt })
      setOpen(false)
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update the request')
    } finally { setBusy(false) }
  }
  const save = () => {
    if (mode === 'waiting' && !reason.trim()) { toast.error('Add what you are waiting for.'); return }
    if (mode === 'waiting' && when === 'manual') { void update(mode); return }
    const time = when === 'custom' ? new Date(date) : new Date()
    if (when !== 'custom') { time.setDate(time.getDate() + (when === 'week' ? 7 : 1)); time.setHours(9, 0, 0, 0) }
    if (!Number.isFinite(time.getTime()) || time <= new Date()) { toast.error('Choose a future reminder time.'); return }
    void update(mode, time.toISOString())
  }
  const deferred = attention.status === 'waiting' || attention.status === 'later'
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {!deferred && attention.kind === 'mention' && (review ? <Button outline disabled={busy} onClick={() => void update('handled')}>Acknowledge mention</Button> : <Button color="brand" disabled={busy} onClick={() => void update('handled')}>Acknowledge mention</Button>)}
        {deferred ? <Button color="brand" disabled={busy} onClick={() => void update('acknowledged')}>Return to Now</Button> : attention.status === 'new' && <Button outline disabled={busy} onClick={() => void update('acknowledged')}>Keep in Now</Button>}
        <Button outline disabled={busy} onClick={() => setOpen((value) => !value)}>{open ? 'Close' : deferred ? 'Edit reminder' : 'Later'}</Button>
      </div>
      {open && <div className="flex flex-col gap-4 border-t border-[var(--gray-5)] pt-4">
        <div className="flex flex-col gap-2">
          <label className="block text-sm" htmlFor={`attention-mode-${thread.task.id}`}>Set aside</label>
          <Select id={`attention-mode-${thread.task.id}`} value={mode} onChange={(value) => { const next = value === 'waiting' ? 'waiting' : 'later'; setMode(next); setWhen(next === 'waiting' ? 'manual' : 'tomorrow') }}>
            <option value="later">Remind me</option><option value="waiting">Waiting on a discussion</option>
          </Select>
        </div>
        {mode === 'waiting' && <div className="flex flex-col gap-2"><label className="block text-sm" htmlFor={`attention-reason-${thread.task.id}`}>What are you waiting for?</label><Input id={`attention-reason-${thread.task.id}`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Product discussion with Maria" /><p className="text-xs text-[var(--gray-10)]">This note is visible only to you.</p></div>}
        <div className="flex flex-col gap-2">
          <label className="block text-sm" htmlFor={`attention-when-${thread.task.id}`}>Bring this back</label>
          <Select id={`attention-when-${thread.task.id}`} value={when} onChange={setWhen}>
            {mode === 'waiting' && <option value="manual">When I bring it back</option>}
            <option value="tomorrow">Tomorrow at 9:00</option><option value="week">In one week at 9:00</option><option value="custom">Choose date and time</option>
          </Select>
        </div>
        {when === 'custom' && <Input aria-label="Reminder date and time" type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} />}
        <div className="flex flex-wrap gap-2"><Button color="brand" disabled={busy} onClick={save}>{mode === 'waiting' ? 'Set as waiting' : 'Set reminder'}</Button><Button outline disabled={busy} onClick={() => setOpen(false)}>Cancel</Button></div>
      </div>}
    </div>
  )
}
