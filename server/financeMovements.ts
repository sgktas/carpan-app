import {createPublicClient, decodeEventLog, http, parseAbiItem, type TransactionReceipt} from 'viem';
import {ARC_USDC} from '../src/arc-wallet';
import type {FinanceMovement, FinanceMovementAlias, FinanceMovementScan, FinanceTransactionFee} from '../src/finance-movements';

export const FINANCE_SYSTEM_EMITTER = '0xfffffffffffffffffffffffffffffffffffffffe';
export const FINANCE_MOVEMENT_BLOCK_WINDOW = 1024;
export const FINANCE_MOVEMENT_TRANSACTION_LIMIT = 20;
export const FINANCE_MOVEMENT_EVENT_LIMIT = 100;
export const FINANCE_MOVEMENT_LOG_LIMIT = 5000;
export const FINANCE_MOVEMENT_SCAN_TIMEOUT_MS = 30000;
export const financeMovementTransferEvent = parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)');
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ZERO = '0x' + '0'.repeat(40), SCALE = 1000000000000n, MAX_UINT256 = (1n << 256n) - 1n;
const hashPattern = /^0x[0-9a-f]{64}$/i, addressPattern = /^0x[0-9a-f]{40}$/i;

export type FinanceMovementLog = {
  address: string;
  transactionHash: string | null;
  blockNumber: bigint | null;
  blockHash: string | null;
  logIndex: number | null;
  removed?: boolean;
  data: string;
  topics: readonly string[];
};
export type FinanceMovementBlock = {number: bigint; hash: string | null; timestamp: bigint};
export type FinanceMovementReader = {
  chainId: () => Promise<number>;
  latest: () => Promise<FinanceMovementBlock>;
  logs: (wallet: string, fromBlock: bigint, toBlock: bigint, direction: 'in' | 'out') => Promise<FinanceMovementLog[]>;
  receipt: (hash: string) => Promise<TransactionReceipt>;
  block: (number: bigint) => Promise<FinanceMovementBlock>;
};
export type FinanceMovementScanOptions = {fromBlock?: bigint; toBlock?: bigint; now?: number; /** Injected clock for deterministic deadline tests; never accepted from an HTTP body. */ clock?: () => number};
export type NormalizedFinanceReceipt = {movements: FinanceMovement[]; fee: FinanceTransactionFee; unmappedAliases: FinanceMovementAlias[]; warnings: string[]};

const client = createPublicClient({transport: http(process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io', {timeout: 12000, retryCount: 1})});
export const financeMovementRpcReader: FinanceMovementReader = {
  chainId: () => client.getChainId(),
  latest: async () => {const block = await client.getBlock(); return {number: block.number, hash: block.hash, timestamp: block.timestamp};},
  logs: (wallet, fromBlock, toBlock, direction) => client.getLogs({
    address: FINANCE_SYSTEM_EMITTER, event: financeMovementTransferEvent,
    args: direction === 'in' ? {to: wallet as `0x${string}`} : {from: wallet as `0x${string}`}, fromBlock, toBlock, strict: true,
  }),
  receipt: hash => client.getTransactionReceipt({hash: hash as `0x${string}`}),
  block: async number => {const block = await client.getBlock({blockNumber: number}); return {number: block.number, hash: block.hash, timestamp: block.timestamp};},
};

function address(value: unknown, allowZero = true): string {
  if (typeof value !== 'string' || !addressPattern.test(value) || (!allowZero && value.toLowerCase() === ZERO)) throw new Error('Arc address is invalid.');
  return value.toLowerCase();
}
function hash(value: unknown): string {if (typeof value !== 'string' || !hashPattern.test(value)) throw new Error('Arc evidence hash is invalid.'); return value.toLowerCase();}
function uint(value: unknown): bigint {if (typeof value !== 'bigint' || value < 0n || value > MAX_UINT256) throw new Error('Arc evidence quantity is invalid.'); return value;}
function index(value: unknown): number {if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Arc evidence log index is invalid.'); return value;}
function timestamp(value: bigint): string {
  uint(value);
  const millis = Number(value) * 1000;
  if (!Number.isSafeInteger(millis) || millis > 8640000000000000) throw new Error('Arc evidence timestamp is invalid.');
  return new Date(millis).toISOString();
}
function validateBlock(block: FinanceMovementBlock): void {uint(block.number); hash(block.hash); timestamp(block.timestamp);}
type DecodedTransfer = {emitter: string; logIndex: number; from: string; to: string; value: bigint};
function transfer(log: FinanceMovementLog, transactionHash: string, block: bigint, blockHash: string): DecodedTransfer | null {
  const emitter = typeof log.address === 'string' ? log.address.toLowerCase() : '';
  if (![FINANCE_SYSTEM_EMITTER, ARC_USDC].includes(emitter) || log.removed || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) return null;
  if (hash(log.transactionHash) !== transactionHash || uint(log.blockNumber) !== block || hash(log.blockHash) !== blockHash) throw new Error('Arc log does not match its receipt.');
  const logIndex = index(log.logIndex);
  let decoded;
  try {decoded = decodeEventLog({abi: [financeMovementTransferEvent], data: log.data as `0x${string}`, topics: log.topics as [`0x${string}`, ...`0x${string}`[]], strict: true}).args;}
  catch {throw new Error('Arc USDC Transfer evidence is malformed.');}
  return {emitter, logIndex, from: address(decoded.from), to: address(decoded.to), value: uint(decoded.value)};
}
const fingerprint = (event: DecodedTransfer) => `${event.from}:${event.to}:${event.emitter === ARC_USDC ? event.value * SCALE : event.value}`;

/** Official EIP-7708 system events are canonical; ERC-20 mirrors are source aliases only.
 * Repeated identical groups are paired once in log order but marked ambiguous: equal
 * counts/amounts do not prove which mirror belongs to which economic movement.
 */
export function normalizeFinanceReceipt(receipt: TransactionReceipt, blockTimestamp: bigint, selectedWallet: string): NormalizedFinanceReceipt {
  const wallet = address(selectedWallet, false), transactionHash = hash(receipt.transactionHash), block = uint(receipt.blockNumber), blockHash = hash(receipt.blockHash);
  const time = timestamp(blockTimestamp), gasPayer = address(receipt.from, false), gasUsed = uint(receipt.gasUsed), effectiveGasPrice = uint(receipt.effectiveGasPrice);
  if (!['success', 'reverted'].includes(receipt.status)) throw new Error('Arc receipt status is invalid.');
  if (!Array.isArray(receipt.logs) || receipt.logs.length > FINANCE_MOVEMENT_LOG_LIMIT) throw new Error('Arc receipt logs are invalid or exceed the evidence limit.');
  const fee: FinanceTransactionFee = {id: `5042:${transactionHash}:gas`, chainId: 5042, hash: transactionHash, block: block.toString(), blockHash, timestamp: time,
    gasPayer, gasUsed: gasUsed.toString(), effectiveGasPrice: effectiveGasPrice.toString(), raw18: (gasUsed * effectiveGasPrice).toString(), decimals: 18, asset: 'USDC', status: receipt.status, source: 'receipt'};
  const events = new Map<number, DecodedTransfer>(), warnings: string[] = [];
  for (const log of receipt.logs) {
    const event = transfer(log, transactionHash, block, blockHash); if (!event) continue;
    const previous = events.get(event.logIndex);
    if (previous && (previous.emitter !== event.emitter || previous.from !== event.from || previous.to !== event.to || previous.value !== event.value)) throw new Error('Conflicting Arc Transfer events share a log index.');
    events.set(event.logIndex, event);
  }
  if (receipt.status === 'reverted') {
    if (events.size) throw new Error('A reverted receipt contains USDC Transfer evidence.');
    return {movements: [], fee, unmappedAliases: [], warnings};
  }
  const relevant = [...events.values()].sort((a, b) => a.logIndex - b.logIndex).filter(event => {
    if (event.from !== wallet && event.to !== wallet) return false;
    if (event.value === 0n || event.from === event.to) {warnings.push('Zero or self Transfer evidence was excluded.'); return false;}
    return true;
  });
  const systems = relevant.filter(event => event.emitter === FINANCE_SYSTEM_EMITTER), mirrors = relevant.filter(event => event.emitter === ARC_USDC);
  const movements: FinanceMovement[] = systems.map(event => ({id: `5042:${transactionHash}:${event.logIndex}`, chainId: 5042, wallet, hash: transactionHash, logIndex: event.logIndex,
    block: block.toString(), blockHash, timestamp: time, from: event.from, to: event.to, asset: 'USDC', token: ARC_USDC, raw18: event.value.toString(), decimals: 18,
    direction: event.from === ZERO ? 'mint' : event.to === ZERO ? 'burn' : event.to === wallet ? 'in' : 'out', emitter: FINANCE_SYSTEM_EMITTER, source: 'arc_system_events', interface: 'native', aliases: []}));
  const byIndex = new Map(movements.map(movement => [movement.logIndex, movement])), groups = new Map<string, {systems: DecodedTransfer[]; mirrors: DecodedTransfer[]}>();
  for (const event of relevant) {const key = fingerprint(event), group = groups.get(key) || {systems: [], mirrors: []}; group[event.emitter === FINANCE_SYSTEM_EMITTER ? 'systems' : 'mirrors'].push(event); groups.set(key, group);}
  const unmappedAliases: FinanceMovementAlias[] = [];
  for (const group of groups.values()) {
    if (!group.mirrors.length) continue;
    const ambiguous = group.systems.length !== 1 || group.mirrors.length !== 1 || group.mirrors[0].logIndex < group.systems[0]?.logIndex;
    for (let i = 0; i < group.mirrors.length; i++) {
      const mirror = group.mirrors[i], system = group.systems[i];
      const alias: FinanceMovementAlias = {id: `5042:${transactionHash}:${mirror.logIndex}:${ARC_USDC}`, hash: transactionHash, logIndex: mirror.logIndex, emitter: ARC_USDC, raw6: mirror.value.toString(), decimals: 6,
        mappingStatus: system ? ambiguous ? 'ambiguous' : 'matched' : 'unmapped'};
      if (!system) {unmappedAliases.push(alias); continue;}
      const movement = byIndex.get(system.logIndex)!; movement.aliases.push(alias); movement.interface = ambiguous ? 'ambiguous' : 'erc20';
    }
    if (ambiguous) {for (const system of group.systems) byIndex.get(system.logIndex)!.interface = 'ambiguous'; warnings.push('ERC-20 alias mapping is ambiguous; automatic annotation migration is unsafe.');}
  }
  if (unmappedAliases.length) warnings.push('ERC-20 evidence has no canonical system event and was not counted as a movement.');
  return {movements, fee, unmappedAliases, warnings: [...new Set(warnings)]};
}

/** Manual, bounded read. No database mutation, background polling or checkpoint advancement.
 * Callers must retain the previous usable snapshot when this throws. A partial result
 * has coverage.complete=false and must never advance a durable ingestion checkpoint.
 */
export async function scanFinanceMovements(walletValue: string, reader: FinanceMovementReader = financeMovementRpcReader, options: FinanceMovementScanOptions = {}): Promise<FinanceMovementScan> {
  const clock = options.clock || Date.now;
  const deadline = clock() + FINANCE_MOVEMENT_SCAN_TIMEOUT_MS;
  const expired = () => clock() >= deadline;
  const deadlineRead = async <T>(read: () => Promise<T>): Promise<T> => {
    const remaining = deadline - clock(); if (remaining <= 0) throw new Error('Arc movement scan time limit reached.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {const result = await Promise.race([read(), new Promise<T>((_resolve, reject) => {timer = setTimeout(() => reject(new Error('Arc movement scan time limit reached.')), remaining);})]); if (expired()) throw new Error('Arc movement scan time limit reached.'); return result;}
    finally {if (timer) clearTimeout(timer);}
  };
  const wallet = address(walletValue, false);
  if (await deadlineRead(() => reader.chainId()) !== 5042) throw new Error('RPC is not connected to Arc Mainnet.');
  const latest = await deadlineRead(() => reader.latest()); validateBlock(latest);
  const to = options.toBlock === undefined ? latest.number : uint(options.toBlock);
  const from = options.fromBlock === undefined ? to >= BigInt(FINANCE_MOVEMENT_BLOCK_WINDOW - 1) ? to - BigInt(FINANCE_MOVEMENT_BLOCK_WINDOW - 1) : 0n : uint(options.fromBlock);
  if (from > to || to > latest.number || to - from >= BigInt(FINANCE_MOVEMENT_BLOCK_WINDOW)) throw new Error('Arc movement scan range is invalid or exceeds the bounded window.');
  const anchor = to === latest.number ? latest : await deadlineRead(() => reader.block(to)); validateBlock(anchor);
  if (anchor.number !== to) throw new Error('Arc scan anchor does not match the requested block.');
  const now = options.now === undefined ? Date.now() : options.now;
  if (!Number.isFinite(now) || !Number.isSafeInteger(now) || now < 0 || now > 8640000000000000) throw new Error('Arc scan time is invalid.');
  const incoming = await deadlineRead(() => reader.logs(wallet, from, to, 'in')), outgoing = await deadlineRead(() => reader.logs(wallet, from, to, 'out'));
  if (!Array.isArray(incoming) || !Array.isArray(outgoing)) throw new Error('Arc movement provider returned invalid log pages.');
  const logTruncated = incoming.length + outgoing.length > FINANCE_MOVEMENT_LOG_LIMIT;
  const candidates = new Map<string, {hash: string; block: bigint; blockHash: string; events: Map<number, DecodedTransfer>}>();
  let parsedLogs = 0;
  for (const page of [incoming, outgoing]) for (const log of page) {
    if (parsedLogs++ >= FINANCE_MOVEMENT_LOG_LIMIT) break;
    if (expired()) throw new Error('Arc movement scan time limit reached.');
    if (log.address?.toLowerCase() !== FINANCE_SYSTEM_EMITTER || log.removed || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    const transactionHash = hash(log.transactionHash), block = uint(log.blockNumber), blockHash = hash(log.blockHash);
    if (block < from || block > to) throw new Error('Arc provider returned evidence outside the scan range.');
    const event = transfer(log, transactionHash, block, blockHash);
    if (!event || event.value === 0n || event.from === event.to || (event.from !== wallet && event.to !== wallet)) continue;
    const previous = candidates.get(transactionHash);
    if (previous && (previous.block !== block || previous.blockHash !== blockHash)) throw new Error('Arc transaction scan evidence conflicts.');
    const candidate = previous || {hash: transactionHash, block, blockHash, events: new Map<number, DecodedTransfer>()};
    const sameIndex = candidate.events.get(event.logIndex);
    if (sameIndex && (sameIndex.from !== event.from || sameIndex.to !== event.to || sameIndex.value !== event.value)) throw new Error('Arc scanned movement evidence conflicts.');
    candidate.events.set(event.logIndex, event); candidates.set(transactionHash, candidate);
  }
  const ordered = [...candidates.values()].sort((a, b) => a.block > b.block ? -1 : a.block < b.block ? 1 : a.hash.localeCompare(b.hash));
  const selected = ordered.slice(0, FINANCE_MOVEMENT_TRANSACTION_LIMIT), movements = new Map<string, FinanceMovement>(), fees = new Map<string, FinanceTransactionFee>();
  const unmappedAliases: FinanceMovementAlias[] = [], warnings: string[] = [], blocks = new Map<string, FinanceMovementBlock>([[to.toString(), anchor]]);
  if (logTruncated) warnings.push('Provider log limit reached; the bounded movement scan is incomplete.');
  let checked = 0, failed = 0, consecutiveFailures = 0, truncated = logTruncated || ordered.length > selected.length;
  for (const candidate of selected) {
    if (expired()) {truncated = true; warnings.push('Scan time limit reached; the bounded movement scan is incomplete.'); break;}
    checked++;
    try {
      const receipt = await deadlineRead(() => reader.receipt(candidate.hash));
      if (hash(receipt.transactionHash) !== candidate.hash || uint(receipt.blockNumber) !== candidate.block || hash(receipt.blockHash) !== candidate.blockHash) throw new Error('Arc receipt does not match scan evidence.');
      let block = blocks.get(candidate.block.toString()); if (!block) {block = await deadlineRead(() => reader.block(candidate.block)); validateBlock(block); blocks.set(candidate.block.toString(), block);}
      if (block.number !== candidate.block || hash(block.hash) !== candidate.blockHash) throw new Error('Arc receipt does not match its block.');
      const result = normalizeFinanceReceipt(receipt, block.timestamp, wallet);
      if (receipt.status !== 'success' || [...candidate.events.values()].some(event => !result.movements.some(movement => movement.logIndex === event.logIndex && movement.from === event.from && movement.to === event.to && movement.raw18 === event.value.toString()))) throw new Error('Arc receipt does not contain the scanned successful movement.');
      for (const movement of result.movements) {if (movements.size >= FINANCE_MOVEMENT_EVENT_LIMIT && !movements.has(movement.id)) {truncated = true; continue;} movements.set(movement.id, movement);}
      fees.set(result.fee.id, result.fee); unmappedAliases.push(...result.unmappedAliases); warnings.push(...result.warnings); consecutiveFailures = 0;
    } catch {failed++; if (++consecutiveFailures >= 3 || expired()) {truncated = true; if (expired()) warnings.push('Scan time limit reached; the bounded movement scan is incomplete.'); break;}}
  }
  if (selected.length && (failed === checked || !checked)) throw new Error('Arc movement evidence could not be verified. Keep the previous snapshot and retry.');
  const complete = !truncated && failed === 0 && checked === ordered.length;
  return {wallet, movements: [...movements.values()], fees: [...fees.values()], unmappedAliases, warnings: [...new Set(warnings)], coverage: {
    wallet, fromBlock: from.toString(), toBlock: to.toString(), toBlockHash: hash(anchor.hash), fetchedAt: new Date(now).toISOString(), checkedTransactions: checked, candidateTransactions: ordered.length,
    failedTransactions: failed, truncated, blockWindow: FINANCE_MOVEMENT_BLOCK_WINDOW, transactionLimit: FINANCE_MOVEMENT_TRANSACTION_LIMIT, eventLimit: FINANCE_MOVEMENT_EVENT_LIMIT,
    complete, scope: 'bounded_usdc_transfers', includesGas: true, includesGasOnlyTransactions: false,
  }};
}
