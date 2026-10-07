import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Radio, RadioField, RadioGroup } from '@/components/radio'
import { Select } from '@/components/select'
import { Text } from '@/components/text'
import { Textarea } from '@/components/textarea'
import { createModelDeployment, getModelRecipeCommand, getModelWeightsGb } from '@/service/api/model-hosting-api'
import { CloudAccountDialog } from '@/pages/secrets/cloud-account-dialog'
import type { ModelHostFlavour } from '@viberglass/types'
import { flavourLabel, formatServingArgs, GENERIC_SERVING_ARGS, parseServingArgs, recipeHardwareFor, withGpuCount } from './deploymentDisplay'
import { useDeployOptions, useModelRecipe } from './useDeployOptions'

const NONE = 'none'
const HUGGING_FACE_ID = /^[\w.-]+\/[\w.-]+$/

function flavourKey(flavour: ModelHostFlavour): string {
  return `${flavour.id}:${flavour.gpuCount}`
}

interface DeployModelDialogProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

/** Deploys an open-weight model to a cloud account, from a vLLM recipe or any Hugging Face model. */
export function DeployModelDialog({ open, onClose, onCreated }: DeployModelDialogProps) {
  const [accountId, setAccountId] = useState('')
  const [source, setSource] = useState<'recipe' | 'custom'>('recipe')
  const [model, setModel] = useState('')
  const [selectedFlavour, setSelectedFlavour] = useState('')
  const [argsText, setArgsText] = useState('')
  const [name, setName] = useState('')
  const [nameEdited, setNameEdited] = useState(false)
  const [addingAccount, setAddingAccount] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingArgs, setLoadingArgs] = useState(false)
  const [weightsGb, setWeightsGb] = useState<number | null>(null)

  const { accounts, setAccounts, recipes, flavours, flavourError } = useDeployOptions(open, accountId)
  const recipeModel = open && source === 'recipe' && recipes.some((recipe) => recipe.model === model) ? model : null
  const recipe = useModelRecipe(recipeModel)

  useEffect(() => {
    if (!open) return
    setSource('recipe')
    setModel('')
    setSelectedFlavour('')
    setArgsText('')
    setName('')
    setNameEdited(false)
  }, [open])

  useEffect(() => {
    if (accounts?.length && !accounts.some((account) => account.id === accountId)) setAccountId(accounts[0].id)
  }, [accounts, accountId])

  useEffect(() => {
    if (!nameEdited) setName(model.split('/').pop() ?? '')
  }, [model, nameEdited])

  // Recipes already only offer GPUs big enough; any other model is checked against its weight files.
  useEffect(() => {
    setWeightsGb(null)
    const id = model.trim()
    if (!open || source !== 'custom' || !HUGGING_FACE_ID.test(id)) return
    let current = true
    const timer = setTimeout(() => {
      getModelWeightsGb(id)
        .then((size) => current && setWeightsGb(size))
        .catch(() => undefined)
    }, 500)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [model, open, source])

  const choices = useMemo(() => {
    if (!flavours) return []
    if (source === 'custom') return flavours
    if (!recipe) return []
    return flavours.filter(
      (flavour) =>
        recipeHardwareFor(flavour, recipe.hardware) !== null &&
        (recipe.minVramGb === null || flavour.vramGb >= recipe.minVramGb)
    )
  }, [flavours, recipe, source])
  const flavour = choices.find((choice) => flavourKey(choice) === selectedFlavour)
  const tooBig = Boolean(flavour && weightsGb !== null && weightsGb > flavour.vramGb)

  useEffect(() => {
    if (!flavour) return
    if (source === 'custom') {
      setArgsText((previous) => previous || formatServingArgs(GENERIC_SERVING_ARGS))
      return
    }
    const hardware = recipe ? recipeHardwareFor(flavour, recipe.hardware) : null
    if (!recipeModel || !hardware) return
    let current = true
    setLoadingArgs(true)
    getModelRecipeCommand(recipeModel, hardware)
      .then((command) => current && setArgsText(formatServingArgs(withGpuCount(command.servingArgs, flavour.gpuCount))))
      .catch((error) => current && toast.error("Couldn't read the recipe", { description: error instanceof Error ? error.message : undefined }))
      .finally(() => current && setLoadingArgs(false))
    return () => {
      current = false
    }
  }, [flavour, recipe, recipeModel, source])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!flavour) return
    setSaving(true)
    try {
      await createModelDeployment({
        name: name.trim(),
        accountId,
        model: model.trim(),
        flavour: { id: flavour.id, gpuCount: flavour.gpuCount },
        servingArgs: parseServingArgs(argsText),
      })
      onCreated()
    } catch (error) {
      toast.error("Couldn't deploy the model", { description: error instanceof Error ? error.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  const noMatchingGpu = source === 'recipe' && recipe && flavours && choices.length === 0
  return (
    <>
      <Dialog open={open && !addingAccount} onClose={() => !saving && onClose()} size="2xl">
        <form onSubmit={handleSubmit}>
          <DialogTitle>Deploy a model</DialogTitle>
          <DialogDescription>
            The model runs on a GPU in your cloud account and scales to zero when idle. You pay the cloud by the minute
            while it runs; the first request after idling waits while it starts.
          </DialogDescription>
          <DialogBody>
            <Fieldset>
              <FieldGroup>
                <Field>
                  <Label>Cloud account</Label>
                  {accounts?.length === 0 ? (
                    <div className="mt-2 flex items-center gap-3">
                      <Text>No cloud account yet.</Text>
                      <Button outline onClick={() => setAddingAccount(true)}>
                        Add a Verda account
                      </Button>
                    </div>
                  ) : (
                    <Select value={accountId || NONE} onChange={setAccountId}>
                      {(accounts ?? []).map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field>
                  <Label>Model</Label>
                  <RadioGroup
                    value={source}
                    onChange={(value) => {
                      setSource(value === 'custom' ? 'custom' : 'recipe')
                      setSelectedFlavour('')
                      setArgsText('')
                    }}
                  >
                    <RadioField>
                      <Radio value="recipe" />
                      <Label>From vLLM Recipes</Label>
                      <Description>Tested serving settings for GPUs the recipe lists.</Description>
                    </RadioField>
                    <RadioField>
                      <Radio value="custom" />
                      <Label>Any Hugging Face model</Label>
                      <Description>Any GPU; you check the model fits and set its tool-call parser.</Description>
                    </RadioField>
                  </RadioGroup>
                  <Input
                    className="mt-3 font-mono"
                    list={source === 'recipe' ? 'model-recipes' : undefined}
                    value={model}
                    onChange={(event) => {
                      setModel(event.target.value)
                      setSelectedFlavour('')
                    }}
                    placeholder={source === 'recipe' ? 'Search recipes, e.g. Qwen/Qwen3-8B' : 'Qwen/Qwen2.5-Coder-7B-Instruct'}
                    required
                  />
                  <datalist id="model-recipes">
                    {recipes.map((recipe) => (
                      <option key={recipe.model} value={recipe.model}>
                        {recipe.title}
                      </option>
                    ))}
                  </datalist>
                  {recipe?.description && <Description>{recipe.description}</Description>}
                </Field>

                <Field>
                  <Label>GPU</Label>
                  {flavourError ? (
                    <Description className="text-red-600 dark:text-red-400">{flavourError}</Description>
                  ) : source === 'recipe' && model.trim() && !recipeModel ? (
                    <Description>Pick a model from the recipe list first, or deploy it as any Hugging Face model.</Description>
                  ) : noMatchingGpu ? (
                    <Description>
                      None of this account&apos;s available GPUs is one the recipe lists ({recipe.hardware.join(', ')}).
                      Deploy it as any Hugging Face model to choose another GPU.
                    </Description>
                  ) : null}
                  <Select value={selectedFlavour || NONE} onChange={setSelectedFlavour} disabled={choices.length === 0}>
                    <option value={NONE}>{flavours === null && accountId ? 'Loading GPUs…' : 'Pick a GPU…'}</option>
                    {choices.map((choice) => (
                      <option key={flavourKey(choice)} value={flavourKey(choice)}>
                        {flavourLabel(choice)}
                      </option>
                    ))}
                  </Select>
                  {tooBig && flavour && (
                    <Description className="text-red-600 dark:text-red-400">
                      The model&apos;s weights are {weightsGb} GB and this GPU has {flavour.vramGb} GB, so it can&apos;t load.
                      Pick a bigger GPU, or a smaller build of the model such as an FP8 one.
                    </Description>
                  )}
                </Field>

                <Field>
                  <Label>Serving arguments</Label>
                  <Description>Passed to vllm serve after the model. One option per line, or paste a whole vllm serve command.</Description>
                  <Textarea
                    className="font-mono"
                    rows={5}
                    value={loadingArgs ? 'Reading the recipe…' : argsText}
                    disabled={loadingArgs}
                    onChange={(event) => setArgsText(event.target.value)}
                  />
                </Field>

                <Field>
                  <Label>Name</Label>
                  <Description>Agents pick the model by this name.</Description>
                  <Input
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      setNameEdited(true)
                    }}
                    required
                    maxLength={64}
                  />
                </Field>
              </FieldGroup>
            </Fieldset>
          </DialogBody>
          <DialogActions>
            <Button outline onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button color="brand" type="submit" disabled={saving || !flavour || loadingArgs || !accountId || tooBig}>
              {saving ? 'Deploying…' : 'Deploy'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <CloudAccountDialog
        open={addingAccount}
        onClose={() => setAddingAccount(false)}
        onSaved={(account) => {
          setAccounts((previous) => [...(previous ?? []), account])
          setAccountId(account.id)
          setAddingAccount(false)
        }}
      />
    </>
  )
}
