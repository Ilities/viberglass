import { useAuth } from '@/context/auth-context'
import { AgentsListPage } from './AgentsListPage'
import { ClankersPage } from './ClankersPage'

/** `/settings/agents`: admins manage the agents; everyone else who sees runs gets the list. */
export function AgentsPage() {
  return useAuth().user?.role === 'admin' ? <ClankersPage /> : <AgentsListPage />
}
