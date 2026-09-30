import type { JobStatus } from '@/service/api/job-api'

/** Exactly what the agent was asked, and any extra guidance it was given. */
export function RunPrompt({ job }: { job: JobStatus }) {
  const context = job.data.context
  const instructionFiles = context?.instructionFiles ?? []

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-[11px] font-semibold tracking-[0.12em] text-[var(--gray-10)] uppercase">Prompt sent to the agent</h2>
        <pre className="mt-2 overflow-auto rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-[var(--gray-11)]">
          {job.data.task}
        </pre>
      </section>
      {context?.additionalContext && (
        <section>
          <h2 className="text-[11px] font-semibold tracking-[0.12em] text-[var(--gray-10)] uppercase">Additional context</h2>
          <p className="mt-2 text-sm whitespace-pre-wrap text-[var(--gray-11)]">{context.additionalContext}</p>
        </section>
      )}
      {instructionFiles.map((file, index) => (
        <section key={`${file.fileType}-${index}`}>
          <h2 className="text-[11px] font-semibold tracking-[0.12em] text-[var(--gray-10)] uppercase">
            Instruction file · {file.fileType}
          </h2>
          {file.content && (
            <pre className="mt-2 overflow-auto rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] p-4 font-mono text-xs whitespace-pre-wrap text-[var(--gray-11)]">
              {file.content}
            </pre>
          )}
        </section>
      ))}
    </div>
  )
}
