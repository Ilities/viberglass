import { Description, Field, Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import type { AgentSignInMethod } from '@viberglass/types'

// The select can't hold an empty value, so the API key needs a value of its own.
const API_KEY = '__api_key__'

interface SignInFieldProps {
  methods: readonly AgentSignInMethod[]
  /** The chosen method's id; empty for an API key. */
  value: string
  onChange: (method: string) => void
}

/** How the harness signs in: an API key, or an account it declares, connected once and kept signed in. */
export function SignInField({ methods, value, onChange }: SignInFieldProps) {
  const chosen = methods.find((method) => method.id === value)

  return (
    <Field>
      <Label>Sign in with</Label>
      <Description>
        {chosen
          ? `Save and start the agent, then connect its ${chosen.label} from the agent's page. It stays signed in from then on.`
          : 'An API key, chosen below.'}
      </Description>
      <Select value={chosen?.id ?? API_KEY} onChange={(next) => onChange(next === API_KEY ? '' : next)}>
        <option value={API_KEY}>API key</option>
        {methods.map((method) => (
          <option key={method.id} value={method.id}>
            {method.label}
          </option>
        ))}
      </Select>
    </Field>
  )
}
