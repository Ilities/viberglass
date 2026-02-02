import { EditClankerClient } from './edit-clanker-client'

export async function generateStaticParams() {
  return [{ slug: '_' }]
}

export default async function EditClankerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <EditClankerClient slug={slug} />
}
