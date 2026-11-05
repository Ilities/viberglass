import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Description, Field, FieldGroup, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Switch, SwitchField } from '@/components/switch'
import type { AppSetting, SaveAppSettingRequest } from '@viberglass/types'
import { useState } from 'react'

/** What the dialog opens on: a setting that's set, one the manifest declares, or a new one. */
export interface SettingDraft {
  name: string
  secret: boolean
  description?: string
  existing: AppSetting | null
}

export function AppSettingDialog({
  draft,
  onClose,
  onSave,
}: {
  draft: SettingDraft
  onClose: () => void
  onSave: (name: string, request: SaveAppSettingRequest) => Promise<void>
}) {
  const existing = draft.existing
  const [name, setName] = useState(draft.name)
  const [secret, setSecret] = useState(draft.secret)
  const [value, setValue] = useState(existing && !existing.secret ? (existing.value ?? '') : '')
  const [forPreviews, setForPreviews] = useState(existing?.secret ? existing.forPreviews : false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A secret that's set keeps its value unless a new one is typed.
  const keepsSecret = Boolean(existing?.secret && secret && value === '')

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(name.trim(), { secret, ...(keepsSecret ? {} : { value }), ...(secret ? { forPreviews } : {}) })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Couldn't save the setting")
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={() => !saving && onClose()} size="lg">
      <DialogTitle>
        {existing ? `Change ${draft.name}` : draft.name ? `Set ${draft.name}` : 'Add a setting'}
      </DialogTitle>
      <DialogDescription>
        {draft.description ?? 'The app reads it as an environment variable.'} Saving restarts the app if it's running.
      </DialogDescription>
      <DialogBody>
        <FieldGroup>
          {!draft.name && (
            <Field>
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value.toUpperCase())}
                placeholder="SLACK_WEBHOOK_URL"
                autoComplete="off"
              />
            </Field>
          )}
          <SwitchField>
            <Label>Secret</Label>
            <Description>Kept in the secret store and never shown again. Agents never see it.</Description>
            <Switch aria-label="Secret" checked={secret} onChange={setSecret} disabled={saving} />
          </SwitchField>
          <Field>
            <Label>Value</Label>
            <Input
              type={secret ? 'password' : 'text'}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={existing?.secret && secret ? 'Leave empty to keep the current value' : undefined}
              autoComplete="off"
              disabled={saving}
            />
          </Field>
          {secret && (
            <SwitchField>
              <Label>Also for previews</Label>
              <Description>
                Previews of changes get it too. Leave it off for keys that act on the real world, such as payments.
              </Description>
              <Switch
                aria-label="Also for previews"
                checked={forPreviews}
                onChange={setForPreviews}
                disabled={saving}
              />
            </SwitchField>
          )}
        </FieldGroup>
        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </DialogBody>
      <DialogActions>
        <Button outline onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button color="brand" onClick={() => void save()} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
