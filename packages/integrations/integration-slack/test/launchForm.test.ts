import type { ChatHandlerServices } from '@viberglass/integration-core'
import { registerModalSubmitHandler } from '../src/backend/chat/modalSubmit'
import { launchChoices, registerSlashCommandHandler } from '../src/backend/chat/slashCommand'

// The chat SDK is ESM-only and doesn't load under Jest; its form elements become the options they were given.
jest.mock(
  'chat',
  () => ({
    Modal: jest.fn((options: unknown) => options),
    Select: jest.fn((options: unknown) => options),
    SelectOption: jest.fn((options: unknown) => options),
    TextInput: jest.fn((options: unknown) => options),
    ThreadImpl: jest.fn(),
  }),
  { virtual: true },
)

const LINK_MESSAGE = 'Link your Slack account in Viberglass (Settings → Notifications) to take part in tasks from Slack.'

function services(linked: boolean): jest.Mocked<ChatHandlerServices> {
  return {
    unlinkedAccountMessage: jest.fn().mockResolvedValue(linked ? null : LINK_MESSAGE),
    listProjects: jest.fn().mockResolvedValue([{ id: 'p-1', name: 'Web', backingKind: 'git' }]),
    listClankers: jest.fn().mockResolvedValue([{ id: 'c-1', name: 'Claude' }]),
    createTicket: jest.fn().mockResolvedValue({ id: 't-1', projectId: 'p-1' }),
    getProject: jest.fn().mockResolvedValue({ id: 'p-1', slug: 'web' }),
    ticketUrl: jest.fn().mockReturnValue(null),
    linkTaskThread: jest.fn(),
    getTaskForThread: jest.fn(),
    receiveThreadMessage: jest.fn(),
    askAgent: jest.fn(),
    answerQuestion: jest.fn(),
    markDone: jest.fn(),
  }
}

const labels = (options: Array<{ label: string }>) => options.map((option) => option.label)

describe('launchChoices', () => {
  it('starts a Git space with a plan or the build', () => {
    const choices = launchChoices([{ id: 'p-1', name: 'Web', backingKind: 'git' }])
    expect(labels(choices.start)).toEqual(['A plan', 'The build'])
    expect(labels(choices.spaces)).toEqual(['Web'])
  })

  it('starts a Files space with the artifact first', () => {
    const choices = launchChoices([{ id: 'p-2', name: 'Decks', backingKind: 'files' }])
    expect(choices.start).toEqual([
      { label: 'The artifact', value: 'execution' },
      { label: 'A plan', value: 'planning' },
    ])
  })

  it('names both kinds of work, and marks the Files spaces, when both kinds of space are listed', () => {
    const choices = launchChoices([
      { id: 'p-1', name: 'Web', backingKind: 'git' },
      { id: 'p-2', name: 'Decks', backingKind: 'files' },
    ])
    expect(labels(choices.start)).toEqual(['A plan', 'The build, or the artifact in a Files space'])
    expect(labels(choices.spaces)).toEqual(['Web', 'Decks (Files)'])
  })
})

describe('the launch form for someone without a linked account', () => {
  it("tells them to link it instead of opening the form", async () => {
    const bot = { onSlashCommand: jest.fn() }
    const platform = services(false)
    registerSlashCommandHandler(bot, platform)
    const [, handler] = bot.onSlashCommand.mock.calls[0]
    const event = { user: { userId: 'U1' }, channel: { id: 'C1', post: jest.fn(), postEphemeral: jest.fn() }, openModal: jest.fn() }

    await handler(event)

    expect(event.channel.postEphemeral).toHaveBeenCalledWith(event.user, LINK_MESSAGE, { fallbackToDM: true })
    expect(event.openModal).not.toHaveBeenCalled()
    expect(platform.listProjects).not.toHaveBeenCalled()
  })

  it('opens the form for a linked account', async () => {
    const bot = { onSlashCommand: jest.fn() }
    registerSlashCommandHandler(bot, services(true))
    const [, handler] = bot.onSlashCommand.mock.calls[0]
    const event = { user: { userId: 'U1' }, channel: { id: 'C1', post: jest.fn(), postEphemeral: jest.fn() }, openModal: jest.fn().mockResolvedValue({ viewId: 'V1' }) }

    await handler(event)

    expect(event.openModal).toHaveBeenCalled()
    expect(event.channel.postEphemeral).not.toHaveBeenCalled()
  })

  it('creates no task when the form is sent without one', async () => {
    const bot = { onModalSubmit: jest.fn() }
    const platform = services(false)
    registerModalSubmitHandler(bot, platform)
    const [, handler] = bot.onModalSubmit.mock.calls[0]
    const values = { projectId: 'p-1', clankerId: 'c-1', mode: 'execution', message: 'Make the deck' }

    const response = await handler({ values, user: { userId: 'U1' }, relatedChannel: { id: 'C1', post: jest.fn() } })

    expect(response).toEqual({ action: 'errors', errors: { message: LINK_MESSAGE } })
    expect(platform.createTicket).not.toHaveBeenCalled()
    expect(platform.askAgent).not.toHaveBeenCalled()
  })
})
