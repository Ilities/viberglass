import { isObjectRecord } from '@viberglass/types'
import { getNestedRecord, toIdentifier } from './shortcutValues'

function addsComment(action: Record<string, unknown>, commentId: string): boolean {
  const adds = getNestedRecord(getNestedRecord(action, 'changes'), 'comment_ids')?.adds
  return Array.isArray(adds) && adds.some((id) => toIdentifier(id) === commentId)
}

/**
 * A comment with the story it's on. A v1 delivery doesn't put the story's id
 * on the comment; the story's own action in the same delivery adds the comment.
 */
export function withCommentStory(data: Record<string, unknown> | undefined, source: Record<string, unknown>): Record<string, unknown> | undefined {
  const commentId = toIdentifier(data?.id)
  if (!data || !commentId || toIdentifier(data.story_id)) return data
  const actions = Array.isArray(source.actions) ? source.actions : []
  const story = actions.find((action) => isObjectRecord(action) && action.entity_type === 'story' && addsComment(action, commentId))
  const storyId = isObjectRecord(story) ? toIdentifier(story.id) : undefined
  return storyId ? { ...data, story_id: storyId } : data
}
