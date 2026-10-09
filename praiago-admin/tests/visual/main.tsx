import React from 'react'
import {createRoot} from 'react-dom/client'
import App from '../../src/App'
import LoginPage from '../../src/pages/LoginPage'
import '../../src/index.css'
createRoot(document.getElementById('root')!).render(<React.StrictMode><div style={{position:'fixed',bottom:0,right:0,zIndex:100,fontSize:8,padding:3,background:'#602665',pointerEvents:'none'}}>QA LOCAL · SEM PRODUÇÃO · DADOS DE TESTE</div>{window.location.pathname==='/login-test'?<LoginPage onLogin={()=>{}}/>:<App/>}</React.StrictMode>)
