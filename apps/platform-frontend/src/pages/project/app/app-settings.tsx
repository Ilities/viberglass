import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Text } from '@/components/text'
import { getAppSettings, removeAppSetting, saveAppSetting } from '@/service/api/app-api'
import type { AppSettingsView } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { AppSettingDialog, type SettingDraft } from './app-setting-dialog'

/** The values the app reads, for maintainers: what's set, and what its manifest asks for that isn't. */
export function AppSettings({ projectId, onLoad }: { projectId: string; onLoad: (view: AppSettingsView) => void }) {
  const [view, setView] = useState<AppSettingsView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<SettingDraft | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const show = useCallback(
    (next: AppSettingsView) => {
      setView(next)
      onLoad(next)
    },
    [onLoad]
  )

  useEffect(() => {
    getAppSettings(projectId)
      .then(show)
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : "Couldn't load the app's settings")
      )
  }, [projectId, show])

  const remove = async (name: string) => {
    setRemoving(name)
    setError(null)
    try {
      show(await removeAppSetting(projectId, name))
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Couldn't remove the setting")
    } finally {
      setRemoving(null)
    }
  }

  const describe = (name: string) => view?.declared.find((setting) => setting.name === name)?.description
  const rows = view ? view.settings.length + view.missing.length : 0

  return (
    <section className="mt-8 border-t border-[var(--gray-5)] pt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Subheading>Settings</Subheading>
          <Text className="mt-1">
            Values the app reads when it starts, such as API keys. Saving or removing one restarts the app. Secret
            values are never shown again.
          </Text>
        </div>
        <Button outline onClick={() => setDraft({ name: '', secret: false, existing: null })}>
          Add setting
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {view && rows === 0 && <Text className="mt-4">The app doesn't ask for any settings.</Text>}
      {view && rows > 0 && (
        <Table className="mt-4">
          <TableHead>
            <TableRow>
              <TableHeader>Name</TableHeader>
              <TableHeader>Value</TableHeader>
              <TableHeader />
            </TableRow>
          </TableHead>
          <TableBody>
            {view.missing.map((name) => {
              const declared = view.declared.find((setting) => setting.name === name)
              return (
                <TableRow key={name}>
                  <SettingName name={name} description={declared?.description} />
                  <TableCell>
                    <Badge color="amber">Not set</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      plain
                      onClick={() =>
                        setDraft({
                          name,
                          secret: declared?.secret ?? false,
                          description: declared?.description,
                          existing: null,
                        })
                      }
                    >
                      Set
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {view.settings.map((setting) => (
              <TableRow key={setting.name}>
                <SettingName name={setting.name} description={describe(setting.name)} />
                <TableCell>
                  {setting.secret ? (
                    <span className="flex items-center gap-2">
                      <Badge>Secret</Badge>
                      {setting.forPreviews && <span className="text-sm text-[var(--gray-10)]">also for previews</span>}
                    </span>
                  ) : (
                    <span className="font-mono text-sm break-all">{setting.value}</span>
                  )}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button
                    plain
                    onClick={() =>
                      setDraft({
                        name: setting.name,
                        secret: setting.secret,
                        description: describe(setting.name),
                        existing: setting,
                      })
                    }
                  >
                    Change
                  </Button>
                  <Button plain disabled={removing === setting.name} onClick={() => void remove(setting.name)}>
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {draft && (
        <AppSettingDialog
          draft={draft}
          onClose={() => setDraft(null)}
          onSave={async (name, request) => {
            show(await saveAppSetting(projectId, name, request))
            setDraft(null)
          }}
        />
      )}
    </section>
  )
}

function SettingName({ name, description }: { name: string; description?: string }) {
  return (
    <TableCell>
      <span className="font-mono text-sm">{name}</span>
      {description && <span className="mt-0.5 block text-sm text-[var(--gray-10)]">{description}</span>}
    </TableCell>
  )
}
