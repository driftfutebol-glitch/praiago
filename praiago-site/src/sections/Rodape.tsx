// lucide v1 tirou os icones de marca (nao existe mais `Instagram`) — AtSign
// resolve o mesmo papel de "perfil social" sem depender de icone de terceiro.
import { Mail, AtSign, ExternalLink } from 'lucide-react'
import Marca from '../components/Marca'
import { CONTATO, PAINEL_RESTAURANTE } from '../dados'

const ANO = new Date().getFullYear()

export default function Rodape() {
  return (
    <footer style={{ background: '#04121f', color: 'rgba(255,255,255,0.72)', padding: '64px 0 36px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        <div className="rodape-grade">
          <div>
            <Marca
              largura={160}
              filtro="drop-shadow(0 0 2px rgba(0,14,10,0.8)) drop-shadow(0 0 8px rgba(0,14,10,0.5))"
            />
            <p style={{ margin: '18px 0 0', maxWidth: 310, fontSize: 14.5, lineHeight: 1.6 }}>
              A praia na palma da sua mão. Comida, bebida e loja entregues onde você estiver na areia.
            </p>
          </div>

          <nav aria-label="Navegação do rodapé">
            <h3 style={ESTILO_TITULO}>O app</h3>
            <ul style={ESTILO_LISTA}>
              <li><a href="#como-funciona" style={ESTILO_LINK}>Como funciona</a></li>
              <li><a href="#perfis" style={ESTILO_LINK}>Pra quem é</a></li>
              <li><a href="#eventos" style={ESTILO_LINK}>Eventos e ingressos</a></li>
              <li><a href="#recursos" style={ESTILO_LINK}>Recursos</a></li>
              <li><a href="#avaliacoes" style={ESTILO_LINK}>Avaliações</a></li>
              <li><a href="#duvidas" style={ESTILO_LINK}>Dúvidas</a></li>
            </ul>
          </nav>

          <nav aria-label="Quem vende">
            <h3 style={ESTILO_TITULO}>Quem vende</h3>
            <ul style={ESTILO_LISTA}>
              <li><a href="#baixar" style={ESTILO_LINK}>App do ambulante</a></li>
              <li>
                <a href={PAINEL_RESTAURANTE} target="_blank" rel="noopener noreferrer" style={ESTILO_LINK}>
                  Painel do restaurante
                  <ExternalLink size={13} strokeWidth={2.4} style={{ marginLeft: 5, verticalAlign: -1 }} />
                </a>
              </li>
            </ul>
          </nav>

          <div>
            <h3 style={ESTILO_TITULO}>Contato</h3>
            <ul style={ESTILO_LISTA}>
              <li>
                <a href={`mailto:${CONTATO.email}`} style={ESTILO_LINK}>
                  <Mail size={14} strokeWidth={2.2} style={{ marginRight: 7, verticalAlign: -2 }} />
                  {CONTATO.email}
                </a>
              </li>
              <li>
                <a href={CONTATO.instagram} target="_blank" rel="noopener noreferrer" style={ESTILO_LINK}>
                  <AtSign size={14} strokeWidth={2.2} style={{ marginRight: 7, verticalAlign: -2 }} />
                  Instagram
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="rodape-base">
          <span style={{ fontSize: 13.5 }}>© {ANO} PraiaGo. Todos os direitos reservados.</span>
          <span style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            {/* Essas duas paginas sao exigidas pela Play Store e ja estao no ar
                nesses caminhos — nao mudar as URLs. */}
            <a href="/termos.html" style={{ ...ESTILO_LINK, fontSize: 13.5 }}>Termos de uso</a>
            <a href="/privacidade.html" style={{ ...ESTILO_LINK, fontSize: 13.5 }}>Política de privacidade</a>
          </span>
        </div>
      </div>

      <style>{`
        .rodape-grade {
          display: grid;
          grid-template-columns: 1.6fr 1fr 1fr 1.2fr;
          gap: 40px;
          padding-bottom: 44px;
          border-bottom: 1px solid rgba(255,255,255,0.10);
        }
        .rodape-base {
          padding-top: 26px;
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          align-items: center;
          justify-content: space-between;
          color: rgba(255,255,255,0.5);
        }
        footer a:hover { color: #7dd3fc !important; }
        @media (max-width: 860px) {
          .rodape-grade { grid-template-columns: 1fr 1fr; gap: 34px; }
        }
        @media (max-width: 520px) {
          .rodape-grade { grid-template-columns: 1fr; }
        }
      `}</style>
    </footer>
  )
}

const ESTILO_TITULO: React.CSSProperties = {
  margin: '0 0 16px',
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.6,
  textTransform: 'uppercase',
  color: '#ffffff',
}

const ESTILO_LISTA: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 11,
}

const ESTILO_LINK: React.CSSProperties = {
  fontSize: 14.5,
  color: 'rgba(255,255,255,0.72)',
  textDecoration: 'none',
  transition: 'color 0.2s ease',
}
