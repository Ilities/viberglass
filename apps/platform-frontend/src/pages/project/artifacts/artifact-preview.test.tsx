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
})
