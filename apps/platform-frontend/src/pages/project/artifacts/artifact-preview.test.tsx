import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
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
})
