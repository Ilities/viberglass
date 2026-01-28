'use client'

import { Button } from '@/components/button'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Divider } from '@/components/divider'
import { Description, Field, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Text } from '@/components/text'
import { Textarea } from '@/components/textarea'

interface AISettingsClientProps {
  project: string
}

export function AISettingsClient({ project }: AISettingsClientProps) {
  return (
    <div className="space-y-8 p-6 lg:p-8">
      <div>
        <Heading>AI Settings</Heading>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Configure the AI agent that automatically fixes bugs.
        </p>
      </div>

      <form className="space-y-8">
        <section>
          <Subheading>AI Agent Configuration</Subheading>
          <Text>Configure the AI agent that automatically fixes bugs.</Text>

          <Divider className="my-6" />

          <Field>
            <Label>AI Provider</Label>
            <Description>The AI service to use for code analysis and fixes.</Description>
            <Select aria-label="AI Provider" name="ai_provider" defaultValue="openai">
              <option value="openai">OpenAI GPT-4</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="google">Google Gemini</option>
              <option value="azure">Azure OpenAI</option>
            </Select>
          </Field>

          <Divider className="my-6" soft />

          <Field>
            <Label>AI API Key</Label>
            <Description>Your API key for the selected AI provider.</Description>
            <Input type="password" aria-label="AI API Key" name="ai_api_key" placeholder="sk-..." />
          </Field>

          <Divider className="my-6" soft />

          <Field>
            <Label>AI Model</Label>
            <Description>The specific AI model to use for code analysis.</Description>
            <Select aria-label="AI Model" name="ai_model" defaultValue="gpt-4">
              <option value="gpt-4">GPT-4</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              <option value="claude-3-opus">Claude 3 Opus</option>
              <option value="claude-3-sonnet">Claude 3 Sonnet</option>
              <option value="gemini-pro">Gemini Pro</option>
            </Select>
          </Field>

          <Divider className="my-6" soft />

          <div className="space-y-4">
            <Text className="text-sm font-medium text-zinc-950 dark:text-white">Auto-Fix Settings</Text>
            <div className="grid gap-4 sm:grid-cols-2">
              <CheckboxField>
                <Checkbox name="auto_fix_enabled" defaultChecked />
                <Label>Enable automatic bug fixes</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox name="auto_fix_high_severity_only" />
                <Label>Only auto-fix high/critical severity bugs</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox name="require_approval" defaultChecked />
                <Label>Require approval before creating pull requests</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox name="create_backup_branches" defaultChecked />
                <Label>Create backup branches before changes</Label>
              </CheckboxField>
            </div>
          </div>

          <Divider className="my-6" soft />

          <Field>
            <Label>Repository Access</Label>
            <Description>GitHub token with repo access for creating fixes.</Description>
            <Input type="password" aria-label="GitHub Repo Token" name="github_repo_token" placeholder="ghp_..." />
          </Field>

          <Divider className="my-6" soft />

          <Field>
            <Label>Code Analysis Prompt</Label>
            <Description>Custom instructions for the AI when analyzing bugs.</Description>
            <Textarea
              rows={4}
              aria-label="Code Analysis Prompt"
              name="code_analysis_prompt"
              placeholder="You are an expert software engineer. Analyze this bug report and provide a fix..."
              defaultValue="You are an expert software engineer with deep knowledge of web development, React, and TypeScript. Analyze the bug report below and provide a targeted fix. Focus on:

1. Understanding the root cause
2. Providing minimal, safe changes
3. Including tests if applicable
4. Following the existing code style and patterns

Bug Report: {bug_description}
Technical Context: {technical_details}
Code Location: {file_path}:{line_number}"
            />
          </Field>

          <Divider className="my-6" soft />

          <div className="space-y-4">
            <Text className="text-sm font-medium text-zinc-950 dark:text-white">Fix Validation</Text>
            <div className="grid gap-4 sm:grid-cols-2">
              <CheckboxField>
                <Checkbox name="run_tests_after_fix" defaultChecked />
                <Label>Run test suite after applying fixes</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox name="check_linting" defaultChecked />
                <Label>Verify code style and linting</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox name="validate_build" />
                <Label>Ensure project builds successfully</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox name="check_dependencies" />
                <Label>Check for dependency conflicts</Label>
              </CheckboxField>
            </div>
          </div>

          <Divider className="my-6" soft />

          <Field>
            <Label>Pull Request Template</Label>
            <Description>Template for AI-generated pull requests.</Description>
            <Textarea
              rows={6}
              aria-label="PR Template"
              name="pr_template"
              defaultValue="## Bug Fix

This PR fixes the following bug report:

**Original Issue:** {bug_title}
**Severity:** {severity}
**Category:** {category}

### Changes Made
- {ai_generated_description}

### Testing
- [x] Code builds successfully
- [x] Tests pass
- [x] Linting passes

### Risk Assessment
{ai_risk_assessment}

Fix generated by Viberglass AI Agent 🤖"
            />
          </Field>
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
