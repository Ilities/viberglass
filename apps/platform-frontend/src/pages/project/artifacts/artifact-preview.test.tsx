import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ArtifactPreviewView } from './artifact-preview'

const mockPreview = jest.fn()
jest.mock('@/service/api/artifact-api', () => ({ getArtifactPreview: (...args: unknown[]) => mockPreview(...args) }))

describe('ArtifactPreviewView', () => {
  it('says the preview is loading until the frame has loaded', async () => {
    mockPreview.mockResolvedValue({ kind: 'frame', format: 'html', url: 'http://preview.test/v/1/deck/index.html', expiresAt: new Date(Date.now() + 3_600_000).toISOString() })
    render(
      <Theme>
        <ArtifactPreviewView projectId="p" artifactId="a" versionId="v" title="Deck" currentVersionHref={null} onDownload={jest.fn()} />
      </Theme>
    )

    const frame = await screen.findByTitle('Preview of Deck')
    expect(screen.getByRole('status')).toHaveTextContent('Loading the preview…')
    fireEvent.load(frame)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('sandboxes web pages but not PDFs, which browsers refuse to show in a sandbox', async () => {
    const expiresAt = new Date(Date.now() + 3_600_000).toISOString()
    mockPreview.mockResolvedValueOnce({ kind: 'frame', format: 'html', url: 'http://preview.test/v/1/deck/index.html', expiresAt })
    const { unmount } = render(
      <Theme>
        <ArtifactPreviewView projectId="p" artifactId="a" versionId="v" title="Deck" currentVersionHref={null} onDownload={jest.fn()} />
      </Theme>
    )
    expect(await screen.findByTitle('Preview of Deck')).toHaveAttribute('sandbox', 'allow-scripts')
    unmount()

    mockPreview.mockResolvedValueOnce({ kind: 'frame', format: 'pdf', url: 'http://preview.test/v/2/report.pdf', expiresAt })
    render(
      <Theme>
        <ArtifactPreviewView projectId="p" artifactId="a" versionId="v2" title="Report" currentVersionHref={null} onDownload={jest.fn()} />
      </Theme>
    )
    expect(await screen.findByTitle('Preview of Report')).not.toHaveAttribute('sandbox')
  })

  const deckUrl = 'http://preview.test/v/1/deck/index.html'
  const renderDeck = async () => {
    mockPreview.mockResolvedValue({ kind: 'frame', format: 'html', url: deckUrl, expiresAt: new Date(Date.now() + 3_600_000).toISOString() })
    render(
      <Theme>
        <ArtifactPreviewView projectId="p" artifactId="a" versionId="v" title="Deck" currentVersionHref={null} onDownload={jest.fn()} />
      </Theme>
    )
    return screen.findByTitle('Preview of Deck')
  }

  it('opens the preview in a tab of its own where the browser has no full screen for elements', async () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null)
    await renderDeck()

    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
    expect(open).toHaveBeenCalledWith(deckUrl, '_blank', 'noopener')
    open.mockRestore()
  })

  it('shows a way out of full screen while the preview fills the screen', async () => {
    let fullscreenElement: Element | null = null
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true })
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement })
    const exitFullscreen = jest.fn(async () => {
      fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen })
    const requestFullscreen = jest.fn(async () => {
      const requested = requestFullscreen.mock.contexts.at(-1)
      fullscreenElement = requested instanceof Element ? requested : null
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: requestFullscreen })
    try {
      const frame = await renderDeck()
      expect(screen.queryByRole('button', { name: 'Exit full screen' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
      const exit = await screen.findByRole('button', { name: 'Exit full screen' })
      expect(fullscreenElement).toContainElement(frame)

      fireEvent.click(exit)
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Exit full screen' })).not.toBeInTheDocument())
      expect(exitFullscreen).toHaveBeenCalled()
      expect(screen.getByTitle('Preview of Deck')).toBe(frame)
    } finally {
      for (const key of ['fullscreenEnabled', 'fullscreenElement', 'exitFullscreen']) Reflect.deleteProperty(document, key)
      Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
    }
  })
})
