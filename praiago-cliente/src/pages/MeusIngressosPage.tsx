import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import OwnedTicketsWallet from '../components/OwnedTicketsWallet'

export default function MeusIngressosPage() {
  const navigate = useNavigate()
  const userId = useStore(state => state.sessao?.id || null)
  return <OwnedTicketsWallet userId={userId} onClose={() => navigate('/eventos')} />
}
