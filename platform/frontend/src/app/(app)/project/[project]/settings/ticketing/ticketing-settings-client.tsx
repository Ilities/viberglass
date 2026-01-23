'use client'

import { Button } from '@/components/button'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Divider } from '@/components/divider'
import { Field, Label, Description } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Text } from '@/components/text'
import type { Metadata } from 'next'
import { useState } from 'react'

interface TicketingSettingsClientProps {
  project: string
}

export function TicketingSettingsClient({ project }: TicketingSettingsClientProps) {
  const [selectedSystem, setSelectedSystem] = useState('github')

  return (
    <div className="space-y-8 p-6 lg:p-8">
      <div>
        <Heading>Ticketing Settings</Heading>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Configure which project management system to send bug reports to.
        </p>
      </div>

      <form className="space-y-8">
        <section>
          <Subheading>Ticketing System Integration</Subheading>
          <Text>Configure which project management system to send bug reports to.</Text>

          <Divider className="my-6" />

          <Field>
            <Label>Primary Ticketing System</Label>
            <Description>The main system where bug reports will be created.</Description>
            <Select
              aria-label="Ticketing System"
              name="primary_system"
              value={selectedSystem}
              onChange={(e) => setSelectedSystem(e.target.value)}
            >
              <option value="github">GitHub Issues</option>
              <option value="linear">Linear</option>
              <option value="jira">Jira</option>
              <option value="gitlab">GitLab Issues</option>
              <option value="azure">Azure DevOps</option>
              <option value="asana">Asana</option>
              <option value="trello">Trello</option>
              <option value="monday">Monday.com</option>
              <option value="clickup">ClickUp</option>
            </Select>
          </Field>

          <Divider className="my-6" soft />

          <div className="space-y-6">
            {selectedSystem === 'github' && (
              <div>
                <Text className="text-sm font-medium text-zinc-950 dark:text-white">GitHub Configuration</Text>
                <Text>Configure your GitHub repository for issue creation.</Text>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field>
                    <Label>Repository Owner</Label>
                    <Input aria-label="GitHub Owner" name="github_owner" placeholder="myorg" />
                  </Field>
                  <Field>
                    <Label>Repository Name</Label>
                    <Input aria-label="GitHub Repo" name="github_repo" placeholder="myproject" />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field>
                      <Label>Personal Access Token</Label>
                      <Input
                        type="password"
                        aria-label="GitHub Token"
                        name="github_token"
                        placeholder="ghp_..."
                      />
                    </Field>
                  </div>
                </div>
              </div>
            )}

            {selectedSystem === 'jira' && (
              <div>
                <Text className="text-sm font-medium text-zinc-950 dark:text-white">Jira Configuration</Text>
                <Text>Configure your Jira instance for issue creation.</Text>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field>
                    <Label>Base URL</Label>
                    <Input aria-label="Jira URL" name="jira_url" placeholder="https://mycompany.atlassian.net" />
                  </Field>
                  <Field>
                    <Label>Project Key</Label>
                    <Input aria-label="Jira Project" name="jira_project" placeholder="PROJ" />
                  </Field>
                  <Field>
                    <Label>Email</Label>
                    <Input type="email" aria-label="Jira Email" name="jira_email" placeholder="user@company.com" />
                  </Field>
                  <Field>
                    <Label>API Token</Label>
                    <Input
                      type="password"
                      aria-label="Jira Token"
                      name="jira_token"
                      placeholder="ATATT3xFfGF0..."
                    />
                  </Field>
                </div>
              </div>
            )}

            {selectedSystem === 'linear' && (
              <div>
                <Text className="text-sm font-medium text-zinc-950 dark:text-white">Linear Configuration</Text>
                <Text>Configure your Linear workspace for issue creation.</Text>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field>
                    <Label>Team ID</Label>
                    <Input aria-label="Linear Team" name="linear_team" placeholder="team-abc123" />
                  </Field>
                  <Field>
                    <Label>API Key</Label>
                    <Input
                      type="password"
                      aria-label="Linear API Key"
                      name="linear_api_key"
                      placeholder="lin_api_..."
                    />
                  </Field>
                </div>
              </div>
            )}

            {(selectedSystem === 'gitlab' || selectedSystem === 'azure' || selectedSystem === 'asana' || selectedSystem === 'trello' || selectedSystem === 'monday' || selectedSystem === 'clickup') && (
              <div className="text-center py-8">
                <Text className="text-zinc-500">Configuration for {selectedSystem} is not yet implemented.</Text>
              </div>
            )}
          </div>

          <Divider className="my-6" soft />

          <div className="space-y-4">
            <Text className="text-sm font-medium text-zinc-950 dark:text-white">Issue Creation Settings</Text>
            <div className="grid gap-4 sm:grid-cols-2">
              <CheckboxField>
                <Checkbox name="create_issues_enabled" defaultChecked />
                <Label>Automatically create issues for bug reports</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox name="attach_screenshots" defaultChecked />
                <Label>Attach screenshots to issues</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox name="attach_recordings" />
                <Label>Attach screen recordings to issues</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox name="include_metadata" defaultChecked />
                <Label>Include technical metadata in issues</Label>
              </CheckboxField>
            </div>
          </div>

          <Divider className="my-6" soft />

          <Field>
            <Label>Issue Labels/Tags</Label>
            <Description>Default labels to apply to created issues.</Description>
            <Input aria-label="Issue Labels" name="default_labels" defaultValue="bug,vibug" />
          </Field>

          <div className="mt-6">
            <Button type="button" color="blue">
              Test Connection
            </Button>
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
