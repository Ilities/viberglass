import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { saveModelHostAccount } from '@/service/api/model-hosting-api'
import type { ModelHostAccount } from '@viberglass/types'

interface CloudAccountDialogProps {
  open: boolean
  /** The account being edited; absent when adding one. */
  account?: ModelHostAccount
  onClose: () => void
  onSaved: (account: ModelHostAccount) => void
}

const empty = { name: '', clientId: '', clientSecret: '', endpointKey: '', huggingFaceToken: '' }

/** Adds a Verda account models are deployed to, or changes its credentials. */
export function CloudAccountDialog({ open, account, onClose, onSaved }: CloudAccountDialogProps) {
  const [form, setForm] = useState(empty)
  const [removeToken, setRemoveToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const editing = account !== undefined

  useEffect(() => {
    if (!open) return
    setForm(account ? { ...empty, name: account.name, clientId: account.clientId } : { ...empty, name: 'Verda' })
    setRemoveToken(false)
  }, [open, account])

  function change(field: keyof typeof empty) {
    return (event: React.ChangeEvent<HTMLInputElement>) => setForm((previous) => ({ ...previous, [field]: event.target.value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      const huggingFaceToken = removeToken ? '' : form.huggingFaceToken.trim() || undefined
      onSaved(
        await saveModelHostAccount(
          {
            name: form.name.trim(),
            host: 'verda',
            clientId: form.clientId.trim(),
            ...(form.clientSecret.trim() ? { clientSecret: form.clientSecret.trim() } : {}),
            ...(form.endpointKey.trim() ? { endpointKey: form.endpointKey.trim() } : {}),
            ...(huggingFaceToken !== undefined ? { huggingFaceToken } : {}),
          },
          account?.id
        )
      )
    } catch (error) {
      toast.error("Couldn't save the cloud account", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  const keep = editing ? 'Leave blank to keep the current one.' : undefined
  return (
    <Dialog open={open} onClose={() => !saving && onClose()} size="lg">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{editing ? `Edit ${account.name}` : 'Add a Verda account'}</DialogTitle>
        <DialogDescription>
          Viberglass creates GPU deployments in this account and bills them to it. Create both keys under Keys in the Verda
          console.
        </DialogDescription>
        <DialogBody>
          <Fieldset>
            <FieldGroup>
              <Field>
                <Label>Name</Label>
                <Input value={form.name} onChange={change('name')} required maxLength={64} />
              </Field>
              <Field>
                <Label>Client ID</Label>
                <Description>From Cloud API credentials. Viberglass uses it to create, scale and delete deployments.</Description>
                <Input value={form.clientId} onChange={change('clientId')} required className="font-mono" />
              </Field>
              <Field>
                <Label>Client secret</Label>
                {keep && <Description>{keep}</Description>}
                <Input type="password" value={form.clientSecret} onChange={change('clientSecret')} required={!editing} placeholder="••••••••" />
              </Field>
              <Field>
                <Label>Inference API key</Label>
                <Description>
                  Requests to the account&apos;s deployments carry it. Agents receive it to call their model.
                  {keep && ` ${keep}`}
                </Description>
                <Input type="password" value={form.endpointKey} onChange={change('endpointKey')} required={!editing} placeholder="••••••••" />
              </Field>
              <Field>
                <Label>Hugging Face token (optional)</Label>
                <Description>
                  Needed only for gated models.
                  {account?.hasHuggingFaceToken && !removeToken && ' A token is stored; leave blank to keep it.'}
                </Description>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={form.huggingFaceToken}
                    onChange={change('huggingFaceToken')}
                    disabled={removeToken}
                    placeholder="hf_…"
                  />
                  {account?.hasHuggingFaceToken && (
                    <Button outline onClick={() => setRemoveToken((previous) => !previous)}>
                      {removeToken ? 'Keep token' : 'Remove token'}
                    </Button>
                  )}
                </div>
              </Field>
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button outline onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button color="brand" type="submit" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add account'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
