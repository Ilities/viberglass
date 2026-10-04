import { Button } from '@/components/button'
import { Textarea } from '@/components/textarea'
import { Timestamp } from '@/components/timestamp'
import { answerQuestion } from '@/service/api/discussion-api'
import type { AgentQuestion, TaskTimelineEntry } from '@viberglass/types'
import { ChatBubbleIcon } from '@radix-ui/react-icons'
import { useState } from 'react'
import { toast } from 'sonner'

type QuestionEntryProps = {
  entry: Extract<TaskTimelineEntry, { kind: 'question' }>
  /** Whether the open question can be answered in the card below the thread, so it isn't repeated here in full. */
  answerBelow?: boolean
}

function askedLine(question: AgentQuestion): string {
  return question.askedOf ? `${question.agent.name} asks ${question.askedOf.name}` : `${question.agent.name} asks`
}

/** Who answered, and for whom when it was someone else: "Quinn answered for Maria: Include Acme". */
function answeredLine(question: AgentQuestion): string {
  const answer = question.answer
  if (!answer) return ''
  const by = answer.by?.name ?? 'Someone'
  const forSomeoneElse = question.askedOf && answer.by && question.askedOf.id !== answer.by.id ? ` for ${question.askedOf.name}` : ''
  return `${by} answered${forSomeoneElse}: ${answer.text}`
}

/**
 * The agent's question in the thread, and its answer once someone gives one.
 * While it's open and answerable below, the thread only points there, so the
 * question isn't shown twice.
 */
export function QuestionEntry({ entry, answerBelow = false }: QuestionEntryProps) {
  const { question } = entry
  const open = question.status === 'open'
  const waiting = question.blocking ? 'The agent is waiting for the answer' : 'The agent carried on with its own assumption meanwhile'
  return (
    <li aria-label={`${question.agent.name}'s question`} className="space-y-1">
      <p className="text-xs text-[var(--gray-10)]">
        <span className="font-medium text-[var(--gray-11)]">{askedLine(question)}</span> · <Timestamp date={entry.at} />
      </p>
      {open && answerBelow ? (
        <p className="line-clamp-1 text-sm text-[var(--gray-11)]">
          {question.question} <span className="text-xs text-[var(--gray-10)]">· {waiting}; answer it below.</span>
        </p>
      ) : (
        <>
          <p className="text-sm whitespace-pre-wrap text-[var(--gray-12)]">{question.question}</p>
          <p className="text-xs text-[var(--gray-10)]">
            {question.answer ? answeredLine(question) : open ? waiting : 'No longer waiting for an answer'}
          </p>
        </>
      )}
    </li>
  )
}

/** Answering one open question: a press on an option, or a written answer. */
function AnswerCard({ taskId, question, viewerId, onAnswered }: { taskId: string; question: AgentQuestion; viewerId: string | undefined; onAnswered: () => void }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const send = async (answer: string) => {
    if (!answer.trim()) return
    setSending(true)
    try {
      await answerQuestion(taskId, question.id, answer.trim())
      setText('')
      onAnswered()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to answer the question')
      // Someone else may have answered it; the thread shows who.
      onAnswered()
    } finally {
      setSending(false)
    }
  }

  return (
    <div role="group" aria-label={`Answer ${question.agent.name}'s question`} className="space-y-3 rounded-xl border-2 border-[var(--accent-7)] bg-[var(--accent-2)] p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--accent-11)]">
        <ChatBubbleIcon className="h-4 w-4" />
        {askedLine(question)}
      </p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--gray-11)]">{question.question}</p>
      {question.askedOf && (
        <p className="text-xs text-[var(--gray-10)]">
          {question.askedOf.id === viewerId
            ? "It's for you. Anyone on the task can help answer it."
            : `It's for ${question.askedOf.name}, who was notified. Anyone on the task can answer if they know.`}
        </p>
      )}
      {question.options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {question.options.map((option) => (
            <Button key={option} outline disabled={sending} onClick={() => void send(option)}>
              {option}
            </Button>
          ))}
        </div>
      )}
      <Textarea
        aria-label="Your answer"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={question.options.length > 0 ? 'Or write your own answer…' : 'Write your answer…'}
        rows={2}
        disabled={sending}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void send(text)
        }}
      />
      <div className="flex justify-end">
        <Button color="brand" onClick={() => void send(text)} disabled={sending || !text.trim()}>
          Answer
        </Button>
      </div>
    </div>
  )
}

/**
 * The agent's open questions, answerable above the composer: those for you
 * first. Anyone who can post may answer; the person asked is the one notified.
 */
export function OpenQuestions({
  taskId,
  entries,
  viewerId,
  onAnswered,
}: {
  taskId: string
  entries: TaskTimelineEntry[]
  viewerId: string | undefined
  onAnswered: () => void
}) {
  const open = entries.flatMap((entry) => (entry.kind === 'question' && entry.question.status === 'open' ? [entry.question] : []))
  if (open.length === 0) return null
  const forViewer = (question: AgentQuestion) => (question.askedOf?.id === viewerId ? 0 : 1)
  return (
    <div className="space-y-3">
      {[...open]
        .sort((a, b) => forViewer(a) - forViewer(b))
        .map((question) => (
          <AnswerCard key={question.id} taskId={taskId} question={question} viewerId={viewerId} onAnswered={onAnswered} />
        ))}
    </div>
  )
}
