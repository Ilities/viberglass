import { Button } from '@/components/button'
import { MagicWandIcon } from '@radix-ui/react-icons'
import { useNavigate } from 'react-router-dom'

export function EnhanceFixButton({ href }: { href: string }) {
  const navigate = useNavigate()

  return (
    <Button color="blue" onClick={() => navigate(href)}>
      <MagicWandIcon className="h-5 w-5" data-slot="icon" />
      Enhance & Fix
    </Button>
  )
}
