interface PageMetaProps {
  title?: string
  description?: string
  noIndex?: boolean
}

const DEFAULT_TITLE = 'Viberglass'
const DEFAULT_DESCRIPTION = 'Tasks that fix themselves'

// React 19 hoists <title> and <meta> into the document head wherever they render.
export function PageMeta({ title, description, noIndex }: PageMetaProps) {
  const pageTitle = title ? `${title} | ${DEFAULT_TITLE}` : DEFAULT_TITLE
  const pageDescription = description ?? DEFAULT_DESCRIPTION
  return (
    <>
      <title>{pageTitle}</title>
      {pageDescription && <meta name="description" content={pageDescription} />}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
    </>
  )
}
