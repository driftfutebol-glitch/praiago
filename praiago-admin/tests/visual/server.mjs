import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import {fileURLToPath} from 'node:url'
const fixtureRoot=fileURLToPath(new URL('.',import.meta.url))
const appRoot=fileURLToPath(new URL('../..',import.meta.url))
const server=await createServer({configFile:false,root:fixtureRoot,plugins:[react(),tailwindcss()],resolve:{dedupe:['react','react-dom'],alias:[{find:/^(?:.*\/lib\/supabase|\.\/supabase)(?:\.ts)?$/,replacement:fileURLToPath(new URL('./mockSupabase.ts',import.meta.url))}]},server:{host:'127.0.0.1',port:5184,strictPort:true,fs:{allow:[appRoot]}},logLevel:'info'})
await server.listen()
server.printUrls()
process.on('SIGINT',async()=>{await server.close();process.exit(0)})
