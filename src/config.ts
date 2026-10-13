/**
 * wagmi configuration
 * Carpan wagmi configuration
 */

import { http, createConfig } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { MAINNET_BRIDGE_CHAINS } from './bridge-mainnet-config'
import {bridgeWalletChains} from './bridge-networks'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

const walletChains=[...MAINNET_BRIDGE_CHAINS,...bridgeWalletChains(true)];
export const config = createConfig({
  chains: [walletChains[0],...walletChains.slice(1)], // Wallet routes only; research stays Arc-only
  connectors: [injected()],
  transports: Object.fromEntries(walletChains.map(c=>[c.id,http(c.rpcUrls.default.http[0])])),
})
