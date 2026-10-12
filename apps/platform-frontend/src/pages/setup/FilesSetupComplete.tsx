import { Button } from '@/components/button'
import { Text } from '@/components/text'
import { FILES_RUNS_UNAVAILABLE } from '@viberglass/types'
import { SetupFrame } from './SetupFrame'

export function FilesSetupComplete({ slug }: { slug: string }) {
  return (
    <SetupFrame files step={3} title="Your Files space is ready" intro="You can create tasks, add instructions and invite people.">
      <Text>{FILES_RUNS_UNAVAILABLE}</Text>
      <Button className="mt-6" color="brand" href={`/spaces/${slug}`}>Go to the space</Button>
    </SetupFrame>
  )
}
