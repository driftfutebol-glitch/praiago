import { AlertTriangle } from 'lucide-react'

export default function ErrorsPage() {
  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-slate-100 tracking-tight">Log de Operação & Erros</h1>
        <p className="text-slate-400 font-medium">Auditoria de sistema e monitoramento de falhas.</p>
      </header>

      <div className="glass-panel p-12 rounded-2xl border-slate-800 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6">
          <AlertTriangle size={32} className="text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-slate-200 mb-2">Sistema Operando Nominalmente</h2>
        <p className="text-slate-400 max-w-md">Não há erros registrados nos aplicativos clientes. O banco de dados está sincronizado e operando em máxima performance.</p>
      </div>
    </div>
  )
}
