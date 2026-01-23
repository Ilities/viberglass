import { Button } from '@/components/button'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Divider } from '@/components/divider'
import { Field, Label, Description } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Text } from '@/components/text'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Widget Settings',
}

export const generateStaticParams = async () => {
  return []
}

export default function WidgetSettingsPage() {
  return (
    <div className="space-y-8 p-6 lg:p-8">
      <div>
        <Heading>Widget Settings</Heading>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Configure how your bug reporting widget appears and behaves on your website.
        </p>
      </div>

      <form className="space-y-8">
        <section>
          <Subheading>Bug Reporting Widget</Subheading>
          <Text>Configure how your bug reporting widget appears and behaves on your website.</Text>

          <Divider className="my-6" />

          <Field>
            <Label>Widget Position</Label>
            <Description>Where the bug report button appears on your website.</Description>
            <Select aria-label="Widget Position" name="widget_position" defaultValue="bottom-right">
              <option value="bottom-right">Bottom Right</option>
              <option value="bottom-left">Bottom Left</option>
              <option value="top-right">Top Right</option>
              <option value="top-left">Top Left</option>
            </Select>
          </Field>

          <Divider className="my-6" soft />

          <Field>
            <Label>Widget Color</Label>
            <Description>The primary color for the bug report widget.</Description>
            <Input type="color" aria-label="Widget Color" name="widget_color" defaultValue="#3b82f6" />
          </Field>

          <Divider className="my-6" soft />

          <Field>
            <Label>Widget Text</Label>
            <Description>The text displayed on the bug report button.</Description>
            <Input aria-label="Widget Text" name="widget_text" defaultValue="Report Bug" />
          </Field>

          <Divider className="my-6" soft />

          <div className="space-y-4">
            <Text className="text-sm font-medium text-zinc-950 dark:text-white">Widget Features</Text>
            <div className="grid gap-4 sm:grid-cols-2">
              <CheckboxField>
                <Checkbox name="screenshot_enabled" defaultChecked />
                <Label>Enable screenshot capture</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox name="recording_enabled" />
                <Label>Enable screen recording</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox name="console_logs_enabled" defaultChecked />
                <Label>Capture console logs</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox name="network_logs_enabled" />
                <Label>Capture network requests</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox name="user_annotations_enabled" defaultChecked />
                <Label>Allow user annotations</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox name="auto_fix_request_enabled" defaultChecked />
                <Label>Enable auto-fix requests</Label>
              </CheckboxField>
            </div>
          </div>

          <Divider className="my-6" soft />

          <Field>
            <Label>Project ID</Label>
            <Description>Your unique project identifier for bug reports.</Description>
            <Input aria-label="Project ID" name="project_id" defaultValue="123e4567-e89b-12d3-a456-426614174000" />
          </Field>

          <Divider className="my-6" soft />

          <div className="space-y-4">
            <Text className="text-sm font-medium text-zinc-950 dark:text-white">Widget Code</Text>
            <Text>Copy this code and add it to your website&apos;s HTML.</Text>
            <div className="rounded-lg bg-zinc-900 p-4">
              <pre className="text-sm text-zinc-100 overflow-x-auto">
{`<script>
  window.ViBugConfig = {
    projectId: "123e4567-e89b-12d3-a456-426614174000",
    position: "bottom-right",
    color: "#3b82f6",
    features: {
      screenshot: true,
      recording: false,
      console: true,
      network: false,
      annotations: true,
      autoFix: true
    }
  };
</script>
<script src="https://cdn.vibug.com/widget.js"></script>`}
              </pre>
            </div>
            <Button type="button" plain>Copy Code</Button>
          </div>
        </section>

        <Divider className="my-10" soft />

        <div className="flex justify-end gap-4">
          <Button type="reset" plain>
            Reset
          </Button>
          <Button type="submit">Save changes</Button>
        </div>
      </form>
    </div>
  )
}
