import { Helmet } from 'react-helmet-async'

interface PageMetaProps {
  title?: string
  description?: string
  noIndex?: boolean
}

const DEFAULT_TITLE = 'Viberglass'
const DEFAULT_DESCRIPTION = 'Tickets that fix themselves'

export function PageMeta({ title, description, noIndex }: PageMetaProps) {
  const pageTitle = title ? `${title} | ${DEFAULT_TITLE}` : DEFAULT_TITLE
  const pageDescription = description ?? DEFAULT_DESCRIPTION
  return (
    <Helmet>
      <title>{pageTitle}</title>
      {pageDescription && <meta name="description" content={pageDescription} />}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
    </Helmet>
  )
}
