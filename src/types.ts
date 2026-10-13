export type UserRole = 'user' | 'admin';
export type AccountLoginMethod = 'x' | 'wallet' | 'email' | 'google' | 'demo';
export type AccountSession = {method: AccountLoginMethod | null; createdAt: string; expiresAt: string};
export type ParticipationStatus =
  | 'reserved'
  | 'pending_verification'
  | 'verified'
  | 'rejected'
  | 'disputed'
  | 'expired';

export interface User {
  id: string;
  xId: string | null;
  authMethod: 'x' | 'wallet' | 'email' | 'google';
  email: string | null;
  xHandle: string;
  xDisplayName: string;
  publicHandle: string | null;
  publicName: string | null;
  walletAddress: string | null;
  walletVerifiedAt: string | null;
  freeSlots: number;
  freeSlotsGrantedAt: string | null;
  totalFreeParticipations: number;
  onboardingUnlocked: boolean;
  pilotFounderAccess: boolean;
  pilotFounderGrantedBy: string | null;
  pilotFounderGrantedAt: string | null;
  role: UserRole;
  isDemo: boolean;
  createdAt: string;
  linkedMethods?: {method: Exclude<AccountLoginMethod, 'demo'>; identifier: string}[];
}

export interface Project {
  id: string;
  submittedBy: string;
  name: string;
  description: string;
  officialDomain: string;
  arcContractAddress: string | null;
  referralLinkPattern: string;
  referralMode: 'url' | 'code';
  validParticipationCondition: string;
  participantBenefit: string;
  sponsoredUntil: string | null;
  validationMethod: string;
  allowsFreeParticipation: boolean;
  allowsPaidParticipation: boolean;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  isDemo?: boolean;
}

export interface ArcDeployment {
  chainId: number;
  contractAddress: string;
  deployerAddress: string;
  transactionHash: string;
  blockNumber: number;
  deployedAt: string;
  deploymentKind: 'direct' | 'trace';
  followerCount: number;
  isFollowing: boolean;
}

export interface ArcVerifiedContract {
  contractAddress: string;
  name: string | null;
  verifiedAt: string;
  language: string | null;
  transactionCount: number | null;
  proxyType: string | null;
}

export interface ArcContractEvent {
  blockNumber: number;
  timestamp: string;
  transactionHash: string;
  logIndex: number;
  kind: 'transfer' | 'approval' | 'ownership' | 'other';
  fromAddress: string | null;
  toAddress: string | null;
  amount: string | null;
  tokenId: string | null;
  topic0: string | null;
}

export interface ArcContractProfile {
  chainId: number;
  contractAddress: string;
  name: string | null;
  token: { name: string | null; symbol: string | null; type: string; decimals: number | null;
    holdersCount: string | null } | null;
  sourceVerified: boolean | null;
  proxyType: string | null;
  explorerAvailable: boolean;
  deployerAddress: string | null;
  deploymentTransactionHash: string | null;
  deploymentBlock: number | null;
  deployedAt: string | null;
  followerCount: number;
  isFollowing: boolean;
  unreadEvents: number;
  linkedProject: { id: string; name: string; description: string; officialDomain: string } | null;
  events: ArcContractEvent[];
}

export interface ArcAddressActivity {
  transactionHash: string;
  fromAddress: string | null;
  toAddress: string | null;
  blockNumber: number | null;
  timestamp: string | null;
  method: string | null;
  kind: string;
}

export interface ArcAddressTransfer {
  transactionHash: string;
  fromAddress: string | null;
  toAddress: string | null;
  blockNumber: number | null;
  timestamp: string | null;
  tokenAddress: string | null;
  tokenName: string | null;
  tokenSymbol: string | null;
  tokenType: string | null;
  amount: string | null;
}

export interface ArcAddressDeployment {
  contractAddress: string;
  transactionHash: string;
  blockNumber: number;
  deployedAt: string;
}

export interface ArcAddressProfile {
  chainId: number;
  address: string;
  name: string | null;
  isContract: boolean;
  sourceVerified: boolean | null;
  proxyType: string | null;
  token: { name: string | null; symbol: string | null; type: string; decimals: number | null;
    holdersCount: string | null } | null;
  creatorAddress: string | null;
  creationTransactionHash: string | null;
  transactionCount: number | null;
  tokenTransferCount: number | null;
  transactions: ArcAddressActivity[];
  transfers: ArcAddressTransfer[];
  indexedDeploymentCount: number;
  indexedDeployments: ArcAddressDeployment[];
}

export interface ArcFollowedContract {
  privateLabel?: string;
  chainId: number;
  contractAddress: string;
  followedAt: string;
  deployerAddress: string | null;
  deploymentTransactionHash: string | null;
  deploymentBlock: number | null;
  deployedAt: string | null;
  unreadEvents: number;
  latestActivityBlock: number | null;
  latestActivityTransactionHash: string | null;
}

export interface ArcIndexerStatus {
  chainId: number;
  network: string;
  lastProcessedBlock: number | null;
  lastObservedHead: number | null;
  lagBlocks: number | null;
  indexedAt: string | null;
  deploymentCount: number;
  live: boolean;
  deploymentCoverage: 'direct';
}

export interface ReferralLink {
  id: string;
  userId: string;
  projectId: string;
  referralCode: string;
  fullLink: string;
  timesReferred: number;
  queuePosition: number;
  queuedAt: string;
  active: boolean;
  clicks?: number;
  availableSlots?: number;
  remainingSlots?: number;
}

export interface ReferralProgramStatus {
  remainingSlots: number;
  availableSlots: number;
  pendingSlots: number;
  unassignedSlots: number;
  contributionCount: number;
  progress: number;
  required: number;
  earnedBatches: number;
}

export interface ReferralCard {
  id: string;
  projectId: string;
  projectName: string;
  referralMode: 'url' | 'code';
  participantBenefit: string;
  condition: string;
  ownerHandle: string;
  ownerName: string;
  verifiedReferrals: number;
  availableSlots: number;
}

export interface LeaderboardEntry {
  rank: number;
  handle: string;
  name: string;
  score: number;
}

export interface Reservation {
  id: string;
  participantId: string;
  referralLinkId: string;
  projectId: string;
  referrerId: string;
  participationType: 'free' | 'paid';
  orderId: string | null;
  expiresAt: string;
  status: 'active' | 'completed' | 'expired';
  createdAt: string;
}

export interface ReservationResult {
  reservation: Reservation;
  referralLink: string;
  referralCode: string;
  project: Project;
  expiresAt: string;
}

export interface Participation {
  id: string;
  reservationId: string;
  participantId: string;
  referrerId: string;
  projectId: string;
  referralLinkId: string;
  participationType: 'free' | 'paid';
  orderId: string | null;
  submittedProof: string | null;
  status: ParticipationStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  disputedAt: string | null;
  disputeNote: string | null;
  isDemo: boolean;
  createdAt: string;
}

export interface AdminStats {
  users: number;
  projects: number;
  pendingProjects: number;
  participations: number;
  pendingParticipations: number;
  disputedParticipations: number;
}

export interface AdminLog {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}
