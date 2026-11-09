export interface AsanaEvent {
  __index?: number
  user?: { gid?: string; name?: string } | null
  resource?: { gid?: string; resource_type?: string; name?: string }
  action?: string
  change?: { field?: string; action?: string; new_value?: unknown; added_value?: unknown; removed_value?: unknown }
  parent?: { gid?: string; resource_type?: string }
  created_at?: string
  story?: { gid?: string }
}

export interface AsanaTask {
  gid?: string
  name?: string
  notes?: string
  permalink_url?: string
  completed?: boolean
  created_by?: { gid?: string; name?: string } | null
  tags?: Array<{ name?: string }>
  memberships?: Array<{ project?: { gid?: string } }>
}

export interface AsanaStory {
  gid?: string
  resource_subtype?: string
  text?: string
  created_by?: { gid?: string; name?: string } | null
  target?: { gid?: string }
  task?: { gid?: string }
}
