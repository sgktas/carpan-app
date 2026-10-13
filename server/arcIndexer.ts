import {
  createPublicClient,
  defineChain,
  http,
  webSocket,
  type Address,
  type Hex,
} from 'viem';
import { db } from './sqliteDb.js';
import {streamBlockNumber} from './arcHead.js';
import {watchedTransferLogs} from './arcWatchedLogs';

const ARC_MAINNET_ID = 5042;
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' as Hex;
const HTTP_RPC = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';
const WS_RPC = process.env.ARC_MAINNET_WS_URL || 'wss://rpc.mainnet.arc.io';
const ARC_MAINNET = defineChain({
  id: ARC_MAINNET_ID,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [HTTP_RPC], webSocket: [WS_RPC] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
});

type CreationTransaction = { hash: Hex; from: Address; to: Address | null; input: Hex };
type DeploymentRow = {
  contractAddress: string;
  deployerAddress: string;
  txHash: string;
  blockNumber: number;
  blockTimestamp: string;
};

const httpClient = createPublicClient({ chain: ARC_MAINNET, transport: http(HTTP_RPC, { retryCount: 3 }) });
const streamClient = createPublicClient({
  chain: ARC_MAINNET,
  transport: webSocket(WS_RPC, { reconnect: true, retryCount: 3 }),
});

function toSafeNumber(value: bigint) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`Arc block number is outside the safe integer range: ${value}`);
  return number;
}

type WatchScan={addresses:Address[];transfers:Awaited<ReturnType<typeof watchedTransferLogs>>;events:Awaited<ReturnType<typeof httpClient.getLogs>>};
export async function indexBlock(blockNumber: bigint, client = httpClient, scan?:WatchScan) {
  const block = await client.getBlock({ blockNumber, includeTransactions: true });
  const blockNumberValue = toSafeNumber(blockNumber);
  const blockTimestamp = new Date(Number(block.timestamp) * 1000).toISOString();
  const transactions = block.transactions as readonly CreationTransaction[];
  const watchedAddresses = scan?.addresses||(db.query(`SELECT DISTINCT contract_address FROM arc_contract_watches
    WHERE chain_id=?`).all(ARC_MAINNET_ID) as { contract_address: string }[])
    .map(row => row.contract_address.toLowerCase() as Address);
  const watchedAddressSet = new Set<string>(watchedAddresses);
  const creationTransactions = transactions.filter(transaction => transaction.to === null);
  const deployments: DeploymentRow[] = [];
  const addressActivities: {
    address: string; txHash: string; logIndex: number; activityType: 'transaction' | 'token_transfer';
    fromAddress: string; toAddress: string | null; tokenAddress: string | null; amountRaw: string | null; method: string | null;
  }[] = [];

  // Receipts are only needed for top-level contract-creation transactions.
  for (let offset = 0; offset < creationTransactions.length; offset += 8) {
    const batch = creationTransactions.slice(offset, offset + 8);
    const receipts = await Promise.all(batch.map(transaction =>
      client.getTransactionReceipt({ hash: transaction.hash }),
    ));
    for (let i = 0; i < batch.length; i += 1) {
      const receipt = receipts[i];
      const transaction = batch[i];
      if (!receipt || !transaction || receipt.status !== 'success' || !receipt.contractAddress) continue;
      deployments.push({
        contractAddress: receipt.contractAddress.toLowerCase(),
        deployerAddress: transaction.from.toLowerCase(),
        txHash: transaction.hash,
        blockNumber: blockNumberValue,
        blockTimestamp,
      });
    }
  }

  // The block already carries full transactions for deployment indexing, so
  // direct wallet sends and calls can be matched without another RPC request.
  for (const transaction of transactions) {
    const from = transaction.from.toLowerCase();
    const to = transaction.to?.toLowerCase() || null;
    const method = transaction.input && transaction.input !== '0x' ? transaction.input.slice(0, 10) : null;
    if (watchedAddressSet.has(from)) {
      addressActivities.push({ address: from, txHash: transaction.hash, logIndex: -1,
        activityType: 'transaction', fromAddress: from, toAddress: to,
        tokenAddress: null, amountRaw: null, method });
    }
    if (to && to !== from && watchedAddressSet.has(to)) {
      addressActivities.push({ address: to, txHash: transaction.hash, logIndex: -1,
        activityType: 'transaction', fromAddress: from, toAddress: to,
        tokenAddress: null, amountRaw: null, method });
    }
  }

  // ERC-20 Transfer events cover wallet token movements, including USDC.
  // Read both indexed address positions in bounded batches, retaining only
  // transfers that involve at least one followed address.
  // A failed scan must leave the checkpoint intact so the entire block retries.
  // Empty blocks cannot contain logs. Avoid three unnecessary reads per watch group.
  const transferLogs = scan?scan.transfers.filter(log=>log.blockNumber===blockNumber):transactions.length?await watchedTransferLogs(client,blockNumber,watchedAddresses):[];
  const seenTransfers = new Set<string>();
  for (const log of transferLogs) {
    const fromTopic = log.topics[1];
    const toTopic = log.topics[2];
    if (log.removed || log.topics[0]?.toLowerCase()!==ERC20_TRANSFER_TOPIC || !fromTopic || !toTopic || !/^0x[0-9a-f]{64}$/i.test(log.data)) continue;
    const from = `0x${fromTopic.slice(-40)}`.toLowerCase();
    const to = `0x${toTopic.slice(-40)}`.toLowerCase();
    if (!watchedAddressSet.has(from) && !watchedAddressSet.has(to)) continue;
    const logKey = `${log.transactionHash}:${log.logIndex}`;
    if (seenTransfers.has(logKey)) continue;
    seenTransfers.add(logKey);
    const amountRaw = BigInt(log.data).toString();
    for (const address of new Set([from, to])) {
      if (watchedAddressSet.has(address)) addressActivities.push({ address,
        txHash: log.transactionHash, logIndex: log.logIndex, activityType: 'token_transfer',
        fromAddress: from, toAddress: to, tokenAddress: log.address.toLowerCase(), amountRaw, method: null });
    }
  }

  const activityLogs: {
    contractAddress: string; txHash: string; logIndex: number;
    topic0: string | null; topicsJson: string; data: string;
  }[] = [];

  // Store only logs for contracts users have chosen to follow.
  for (let offset = 0; (scan||transactions.length)&&offset < watchedAddresses.length; offset += 50) {
    const addressBatch = watchedAddresses.slice(offset, offset + 50);
    const logs = scan?scan.events.filter(log=>log.blockNumber===blockNumber&&addressBatch.includes(log.address.toLowerCase() as Address)):await client.getLogs({
      address: addressBatch,
      fromBlock: blockNumber,
      toBlock: blockNumber,
    });
    for (const log of logs) {
      if(log.removed)continue;
      activityLogs.push({
        contractAddress: log.address.toLowerCase(),
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        topic0: log.topics[0] || null,
        topicsJson: JSON.stringify(log.topics),
        data: log.data,
      });
    }
  }

  const writeBlock = db.transaction(() => {
    const insertDeployment = db.query(`INSERT OR IGNORE INTO arc_contract_deployments(
      chain_id,contract_address,deployer_address,tx_hash,block_number,block_timestamp,deployment_kind,indexed_at
    ) VALUES(?,?,?,?,?,?,?,?)`);
    for (const deployment of deployments) {
      insertDeployment.run(ARC_MAINNET_ID, deployment.contractAddress, deployment.deployerAddress,
        deployment.txHash, deployment.blockNumber, deployment.blockTimestamp, 'direct', new Date().toISOString());
    }

    const insertEvent = db.query(`INSERT OR IGNORE INTO arc_contract_events(
      chain_id,contract_address,block_number,block_timestamp,tx_hash,log_index,topic0,topics_json,data
    ) VALUES(?,?,?,?,?,?,?,?,?)`);
    for (const event of activityLogs) {
      insertEvent.run(ARC_MAINNET_ID, event.contractAddress, blockNumberValue, blockTimestamp,
        event.txHash, event.logIndex, event.topic0, event.topicsJson, event.data);
    }

    const insertAddressActivity = db.query(`INSERT OR IGNORE INTO arc_address_activity(
      chain_id,address,block_number,block_timestamp,tx_hash,log_index,activity_type,
      from_address,to_address,token_address,amount_raw,method
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const activity of addressActivities) {
      insertAddressActivity.run(ARC_MAINNET_ID, activity.address, blockNumberValue, blockTimestamp,
        activity.txHash, activity.logIndex, activity.activityType, activity.fromAddress,
        activity.toAddress, activity.tokenAddress, activity.amountRaw, activity.method);
    }

    db.run(`INSERT INTO arc_indexer_state(chain_id,last_processed_block,updated_at) VALUES(?,?,?)
      ON CONFLICT(chain_id) DO UPDATE SET last_processed_block=excluded.last_processed_block,
      updated_at=excluded.updated_at`, [ARC_MAINNET_ID, blockNumberValue, new Date().toISOString()]);
  });
  writeBlock();

  if (deployments.length) console.log(`[Arc Radar] ${deployments.length} direct deployment(s) at block ${blockNumberValue}`);
}

/** Log queries are shared across up to 128 blocks; checkpoints still commit in order. */
export async function indexBlockRange(from:bigint,to:bigint,client=httpClient){
 if(from<0n||to<from||to-from>=128n)throw Error('Invalid bounded index window');
 const addresses=(db.query('SELECT DISTINCT contract_address FROM arc_contract_watches WHERE chain_id=?').all(ARC_MAINNET_ID) as {contract_address:string}[]).map(row=>row.contract_address.toLowerCase() as Address);
 let scan:WatchScan|undefined;
 if(addresses.length){
  const transfers=await watchedTransferLogs(client,from,addresses,to),events:WatchScan['events']=[];
  for(let i=0;i<addresses.length;i+=50)events.push(...await client.getLogs({address:addresses.slice(i,i+50),fromBlock:from,toBlock:to}));
  for(const log of [...transfers,...events])if(log.blockNumber===null||log.blockNumber===undefined||log.blockNumber<from||log.blockNumber>to)throw Error('Unverifiable watched log block');
  scan={addresses,transfers,events};
 }
 for(let block=from;block<=to;block++)await indexBlock(block,client,scan);
}

export async function startArcIndexer() {
  const latest = await httpClient.getBlockNumber();
  const existing = db.query('SELECT last_processed_block FROM arc_indexer_state WHERE chain_id=?')
    .get(ARC_MAINNET_ID) as { last_processed_block: number } | null;

  let cursor = existing ? BigInt(existing.last_processed_block) : null;
  if (cursor === null) {
    const explicitStart = Number(process.env.ARC_INDEXER_START_BLOCK);
    const backfillValue = Number(process.env.ARC_INDEXER_BACKFILL_BLOCKS || 10000);
    const backfill = Number.isSafeInteger(backfillValue) ? Math.max(0, Math.min(backfillValue, 100000)) : 10000;
    const initialBlock = Number.isSafeInteger(explicitStart) && explicitStart >= 0
      ? BigInt(explicitStart)
      : latest > BigInt(backfill) ? latest - BigInt(backfill) : 0n;
    cursor = initialBlock - 1n;
    console.log(`[Arc Radar] Starting Arc Mainnet index at block ${initialBlock}`);
  } else {
    console.log(`[Arc Radar] Resuming Arc Mainnet index after block ${cursor}`);
  }

  let requestedHead = latest;
  let lastSavedHead = 0n;
  let lastHeadSavedAt = 0;
  let processing = false;
  let retryAfter = 0;
  const catchUp = async () => {
    if (processing || Date.now()<retryAfter) return;
    processing = true;
    try {
      while (cursor! < requestedHead) {
        const next = cursor! + 1n;
        const followed=!!db.query('SELECT 1 FROM arc_contract_watches WHERE chain_id=? LIMIT 1').get(ARC_MAINNET_ID);
        // Share expensive log reads across short groups instead of querying
        // each half-second block. The public API reports this real block lag.
        if(followed&&requestedHead-cursor!<32n)break;
        const end=requestedHead<next+127n?requestedHead:next+127n;
        await indexBlockRange(next,end);
        cursor = end;
      }
    } catch (error) {
      const saved=db.query('SELECT last_processed_block FROM arc_indexer_state WHERE chain_id=?').get(ARC_MAINNET_ID) as {last_processed_block:number}|null;
      if(saved)cursor=BigInt(saved.last_processed_block);
      retryAfter=Date.now()+5000;
      console.error('[Arc Radar] Block indexing paused; it will retry on the next head:', error);
    } finally {
      processing = false;
    }
  };

  const schedule = (height: bigint) => {
    if (height > requestedHead) requestedHead = height;
    const now = Date.now();
    if (height > lastSavedHead && (height - lastSavedHead >= 100n || now - lastHeadSavedAt >= 5000)) {
      db.run(`UPDATE arc_indexer_state SET last_observed_head=?,head_observed_at=? WHERE chain_id=?`,
        [toSafeNumber(height), new Date(now).toISOString(), ARC_MAINNET_ID]);
      lastSavedHead = height;
      lastHeadSavedAt = now;
    }
    void catchUp();
  };

  const unwatch = streamClient.watchBlocks({
    onBlock(block) { const number=streamBlockNumber(block);if(number!==null)schedule(number); },
    onError(error) { console.error('[Arc Radar] WebSocket stream error:', error); },
  });

  schedule(latest);
  // Catch up after reconnects and providers that silently stop streaming.
  setInterval(() => {
    void httpClient.getBlockNumber().then(schedule)
      .catch(error => console.error('[Arc Radar] Could not read Arc head:', error));
  }, 5000);

  return unwatch;
}

if (import.meta.main) {
  void startArcIndexer().catch(error => {
    console.error('[Arc Radar] Indexer could not start:', error);
    process.exitCode = 1;
  });
}
