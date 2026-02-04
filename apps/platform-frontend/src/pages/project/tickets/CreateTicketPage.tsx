import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import { useProject } from '@/context/project-context'
import { createTicket } from '@/service/api/ticket-api'
import type { CreateTicketRequest, Severity } from '@viberglass/types'
import { useParams, useNavigate } from 'react-router-dom'
import { useState, useRef } from 'react'

const severities = [
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' },
  { id: 'critical', name: 'Critical' },
]

export function CreateTicketPage() {
  const { project } = useParams<{ project: string }>()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [recordingFile, setRecordingFile] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const screenshotInputRef = useRef<HTMLInputElement>(null)
  const recordingInputRef = useRef<HTMLInputElement>(null)
  const { project: projectData } = useProject()

  function handleScreenshotChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      setScreenshotFile(file)
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setScreenshotPreview(reader.result as string)
        }
        reader.readAsDataURL(file)
      }
    }
  }

  function handleRecordingChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      setRecordingFile(file)
    }
  }

  function clearScreenshot() {
    setScreenshotFile(null)
    setScreenshotPreview(null)
    if (screenshotInputRef.current) {
      screenshotInputRef.current.value = ''
    }
  }

  function clearRecording() {
    setRecordingFile(null)
    if (recordingInputRef.current) {
      recordingInputRef.current.value = ''
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectData) return

    setIsSubmitting(true)
    setError(null)

    const formData = new FormData(event.currentTarget)

    try {
      const ticketData: CreateTicketRequest = {
        projectId: projectData.id,
        title: formData.get('title') as string,
        description: formData.get('description') as string,
        severity: formData.get('severity') as Severity,
        category: formData.get('category') as string,
        autoFixRequested: false,
        ticketSystem: projectData.ticketSystem,
        metadata: {
          browser: { name: 'Manual Entry', version: '1.0' },
          os: { name: 'Manual Entry', version: '1.0' },
          console: [],
          errors: [],
          pageUrl: window.location.href,
          timestamp: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        annotations: [],
      }

      const ticket = await createTicket(ticketData, screenshotFile || undefined, recordingFile || undefined)
      navigate(`/project/${project}/tickets/${ticket.id}`)
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred')
      setIsSubmitting(false)
    }
  }

  return (
    <form className="mx-auto max-w-4xl" onSubmit={handleSubmit}>
      <Heading>Create New Ticket</Heading>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <Fieldset className="mt-8">
        <FieldGroup>
          <Field>
            <Label>Title</Label>
            <Description>A brief summary of the issue.</Description>
            <Input name="title" placeholder="e.g. Navigation bar overlaps content" required />
          </Field>

          <Field>
            <Label>Description</Label>
            <Description>Provide more details about the bug and how to reproduce it.</Description>
            <Textarea name="description" rows={5} placeholder="Steps to reproduce..." required />
          </Field>

          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            <Field>
              <Label>Severity</Label>
              <Description>How critical is this issue?</Description>
              <Select name="severity" defaultValue="medium">
                {severities.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field>
              <Label>Category</Label>
              <Description>What area of the project is affected?</Description>
              <Input name="category" placeholder="e.g. UI, Backend, API" required />
            </Field>
          </div>

          <Field>
            <Label>Screenshot (Optional)</Label>
            <Description>Upload a screenshot to help illustrate the issue. PNG, JPG, GIF, or WebP up to 10MB.</Description>
            <div className="mt-2">
              <Input
                ref={screenshotInputRef}
                name="screenshot"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handleScreenshotChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/20 dark:file:text-brand-400"
              />
            </div>
            {screenshotPreview && (
              <div className="mt-2 relative inline-block">
                <img 
                  src={screenshotPreview} 
                  alt="Screenshot preview" 
                  className="max-h-48 rounded-md border border-gray-200 dark:border-gray-700"
                />
                <button
                  type="button"
                  onClick={clearScreenshot}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            {screenshotFile && !screenshotPreview && (
              <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>{screenshotFile.name}</span>
                <button
                  type="button"
                  onClick={clearScreenshot}
                  className="text-red-500 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            )}
          </Field>

          <Field>
            <Label>Screen Recording (Optional)</Label>
            <Description>Upload a video recording to demonstrate the issue. MP4, WebM, or QuickTime up to 10MB.</Description>
            <div className="mt-2">
              <Input
                ref={recordingInputRef}
                name="recording"
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={handleRecordingChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 dark:file:bg-brand-900/20 dark:file:text-brand-400"
              />
            </div>
            {recordingFile && (
              <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>{recordingFile.name}</span>
                <button
                  type="button"
                  onClick={clearRecording}
                  className="text-red-500 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            )}
          </Field>

          <div className="flex justify-end gap-4 border-t border-zinc-950/10 pt-8 dark:border-white/10">
            <Button outline href={`/project/${project}/tickets`}>
              Cancel
            </Button>
            <Button type="submit" color="brand" disabled={isSubmitting || !projectData}>
              {isSubmitting ? 'Creating...' : 'Create Ticket'}
            </Button>
          </div>
        </FieldGroup>
      </Fieldset>
    </form>
  )
}
