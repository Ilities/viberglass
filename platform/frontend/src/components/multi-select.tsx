'use client'

import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { useState } from 'react'
import clsx from 'clsx'

interface MultiSelectOption {
  id: string
  label: string
  description?: string
}

interface MultiSelectProps {
  label: string
  description?: string
  options: MultiSelectOption[]
  value: string[]
  onChange: (selected: string[]) => void
  emptyMessage?: string
  searchable?: boolean
}

export function MultiSelect({
  label,
  description,
  options,
  value,
  onChange,
  emptyMessage = 'No options available',
  searchable = false,
}: MultiSelectProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredOptions = searchable
    ? options.filter(
        (opt) =>
          opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          opt.description?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : options

  const handleToggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      onChange([...value, id])
    }
  }

  const handleSelectAll = () => {
    onChange(filteredOptions.map((opt) => opt.id))
  }

  const handleDeselectAll = () => {
    onChange([])
  }

  return (
    <Field>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        {options.length > 0 && (
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Select All
            </button>
            <span className="text-zinc-400 dark:text-zinc-600">|</span>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Clear
            </button>
          </div>
        )}
      </div>
      {description && <Description>{description}</Description>}

      {searchable && options.length > 5 && (
        <div className="mt-3">
          <Input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-zinc-950/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
        {filteredOptions.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>
        )}

        {filteredOptions.map((option) => (
          <label
            key={option.id}
            className={clsx(
              'flex cursor-pointer items-start gap-3 rounded-md p-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800',
              value.includes(option.id) && 'bg-blue-50 dark:bg-blue-950/20',
            )}
          >
            <input
              type="checkbox"
              checked={value.includes(option.id)}
              onChange={() => handleToggle(option.id)}
              className="mt-0.5 size-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800"
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-zinc-900 dark:text-white">{option.label}</div>
              {option.description && (
                <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{option.description}</div>
              )}
            </div>
          </label>
        ))}
      </div>

      {value.length > 0 && (
        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{value.length} selected</div>
      )}
    </Field>
  )
}
