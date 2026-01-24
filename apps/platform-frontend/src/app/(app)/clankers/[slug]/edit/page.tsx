import { EditClankerClient } from './edit-clanker-client'

export const generateStaticParams = async () => {
  return []
}

export default async function EditClankerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <EditClankerClient slug={slug} />
}
