import { ClankerDetailClient } from './clanker-detail-client'

export async function generateStaticParams() {
  return [{ slug: '_' }]
}

export default async function ClankerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <ClankerDetailClient slug={slug} />
}
