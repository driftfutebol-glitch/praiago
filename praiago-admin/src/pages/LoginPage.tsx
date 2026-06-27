import { useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldAlert, Terminal } from 'lucide-react'

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [erro, setErro] = useState('')

  function handleLogin() {
    if (user === 'admin' && pass === 'admin') {
      onLogin()
    } else {
      setErro('ACESSO NEGADO. CREDENCIAIS INVÁLIDAS.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Effect */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900/20 via-slate-950 to-slate-950 pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className="glass-panel p-10 rounded-2xl w-full max-w-md relative z-10 border-slate-800"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-purple-500/10 rounded-xl flex items-center justify-center mb-4 neon-border">
            <ShieldAlert size={32} className="text-purple-400" />
          </div>
          <h1 className="text-2xl font-black text-slate-100 tracking-wider">PRAIAGO <span className="neon-text-purple">SYSADMIN</span></h1>
          <p className="text-slate-500 text-sm mt-2 font-mono">Nível de Acesso: Nível 5 (Absoluto)</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest font-mono">USUÁRIO</label>
            <div className="relative">
              <Terminal size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                type="text" 
                value={user}
                onChange={e => setUser(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-3 pl-12 pr-4 text-slate-200 outline-none focus:border-purple-500/50 transition-colors font-mono"
                placeholder="root"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest font-mono">SENHA</label>
            <input 
              type="password" 
              value={pass}
              onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              className="w-full bg-slate-900/50 border border-slate-800 rounded-lg py-3 px-4 text-slate-200 outline-none focus:border-purple-500/50 transition-colors font-mono"
              placeholder="••••••••"
            />
          </div>

          {erro && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs font-mono font-bold text-center">
              {erro}
            </motion.div>
          )}

          <button 
            onClick={handleLogin}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-4 rounded-lg mt-4 transition-colors tracking-widest flex items-center justify-center gap-2"
          >
            AUTENTICAR
          </button>
        </div>
      </motion.div>
    </div>
  )
}
