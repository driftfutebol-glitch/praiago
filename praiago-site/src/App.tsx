import { useState } from 'react'
import Intro, { deveMostrarIntro } from './components/Intro'
import Cabecalho from './sections/Cabecalho'
import Hero from './sections/Hero'
import VideoScroll from './sections/VideoScroll'
import Perfis from './sections/Perfis'
import Eventos from './sections/Eventos'
import Recursos from './sections/Recursos'
import Avaliacoes from './sections/Avaliacoes'
import Faq from './sections/Faq'
import ChamadaFinal from './sections/ChamadaFinal'
import Rodape from './sections/Rodape'

export default function App() {
  // Decidido uma vez, no primeiro render: chamar deveMostrarIntro() de novo
  // consumiria a marca da sessao e a intro nunca apareceria.
  const [mostrarIntro, setMostrarIntro] = useState(deveMostrarIntro)

  return (
    <>
      {mostrarIntro && <Intro onFim={() => setMostrarIntro(false)} />}

      <Cabecalho />
      <main>
        <Hero />
        <VideoScroll />
        <Perfis />
        <Eventos />
        <Recursos />
        <Avaliacoes />
        <Faq />
        <ChamadaFinal />
      </main>
      <Rodape />
    </>
  )
}
