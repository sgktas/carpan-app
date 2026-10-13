/*
 *  ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗
 *  ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗
 *  ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║
 *  ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║
 *  ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝
 *  ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝
 *
 *  Carpan application entry point
 */

import './tracing'
import './console-capture'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConnectKitProvider } from 'connectkit'
import { Toaster } from 'sonner'
import { config } from './config'
import App from './App'
import './index.css'
import './carpan-theme.css'
import './carpan-navigation.css'
import './carpan-quality.css'
import './carpan-data-workspace.css'
import './carpan-workspace-finish.css'
import { I18nProvider, useI18n } from './i18n'

function LocalizedApp(){const {language}=useI18n();return <ConnectKitProvider mode="dark" options={{language:language==='en'?'en-US':'tr-TR'}}><App/><Toaster position="top-center" theme="dark"/></ConnectKitProvider>;}

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider><LocalizedApp/></I18nProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
