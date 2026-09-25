import { useId } from 'react'
import { Moon, Sun } from 'lucide-react'
import { usePreferences } from '../store/usePreferences'

export default function AppearanceSetting() {
  const darkMode = usePreferences(s => s.darkMode)
  const setDarkMode = usePreferences(s => s.setDarkMode)
  const id = useId()
  return <div className="pg-menu-row pg-appearance-setting">
    <span className="pg-menu-icon pg-appearance-icon" aria-hidden="true">{darkMode ? <Moon size={20}/> : <Sun size={20}/>}</span>
    <span className="pg-menu-copy"><span id={id}>Modo escuro</span><small id={`${id}-description`}>{darkMode ? 'Ativado' : 'Desativado'} · Neste aparelho</small></span>
    <button type="button" role="switch" aria-labelledby={id} aria-describedby={`${id}-description`} aria-checked={darkMode} className="pg-toggle" onClick={() => setDarkMode(!darkMode)}/>
  </div>
}
