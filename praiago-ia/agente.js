require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Configuração do Supabase (Acesso Admin via Service Role Key)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO: Faltam variáveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('🤖 Agente IA PraiaGo iniciado! Monitorando o Supabase...');

// Lista de zonas (simplificada para o Cérebro processar)
const BEACH_ZONES = [
  { id: 'z1', nome: 'Canto do Forte' },
  { id: 'z2', nome: 'Boqueirão' },
  { id: 'z3', nome: 'Guilhermina' },
  { id: 'z4', nome: 'Aviação' },
  { id: 'z5', nome: 'Tupi' },
  { id: 'z6', nome: 'Ocian' },
  { id: 'z7', nome: 'Mirim' },
  { id: 'z8', nome: 'Caiçara' }
];

// Estado de memória do Agente (Score Base)
let memoryScores = BEACH_ZONES.map(z => ({
  zoneId: z.id,
  score: 0.2 + Math.random() * 0.3, // score inicial base
  pedidosHora: Math.floor(Math.random() * 5),
  ambulantesAtivos: Math.floor(Math.random() * 3) + 1,
}));

// Escuta a tabela de Pedidos para esquentar as zonas!
supabase.channel('agente_escuta_pedidos')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, (payload) => {
    console.log('🔔 NOVO PEDIDO DETECTADO:', payload.new.id, 'na zona:', payload.new.zona);
    const zonaNome = payload.new.zona;
    
    // Procura a zona (Ex: 'Zona Boqueirão' -> 'Boqueirão')
    const zoneFound = BEACH_ZONES.find(z => zonaNome && zonaNome.includes(z.nome));
    
    if (zoneFound) {
      const idx = memoryScores.findIndex(m => m.zoneId === zoneFound.id);
      if (idx !== -1) {
        // Esquenta a zona agressivamente quando um pedido real cai
        memoryScores[idx].pedidosHora += 1;
        memoryScores[idx].score = Math.min(1.0, memoryScores[idx].score + 0.15);
        console.log(`🔥 Aquecendo zona ${zoneFound.nome}! Novo Score: ${memoryScores[idx].score.toFixed(2)}`);
      }
    }
  })
  .subscribe();

// Motor de "Drift": a cada 5 segundos, recalcula o calor (esfriando as que não têm pedidos)
// e transmite para o mapa do Ambulante via Broadcast.
const broadcastChannel = supabase.channel('radar_ia');

/* 
setInterval(() => {
  memoryScores = memoryScores.map(h => {
    // Esfria lentamente (drift negativo) ou tem uma oscilação natural
    let newScore = h.score + (Math.random() - 0.55) * 0.05;
    return {
      ...h,
      score: Math.min(1, Math.max(0, newScore)), // Mantém entre 0 e 1
      pedidosHora: Math.max(0, h.pedidosHora + Math.floor((Math.random() - 0.5) * 2)), // oscila
    };
  });

  // Mapeia para o formato que o Frontend espera (adicionando o 'nivel')
  const heatData = memoryScores.map(h => {
    let nivel = 'frio';
    if (h.score >= 0.8) nivel = 'explosivo';
    else if (h.score >= 0.6) nivel = 'quente';
    else if (h.score >= 0.4) nivel = 'morno';

    return { ...h, nivel };
  });

  // Transmite o resultado processado
  broadcastChannel.send({
    type: 'broadcast',
    event: 'heat_update',
    payload: heatData
  });
  
  process.stdout.write('.'); // feedback visual no terminal
}, 5000);

console.log('📡 Satélite de Drift desativado! Não estamos mais transmitindo scores fakes.');
*/
