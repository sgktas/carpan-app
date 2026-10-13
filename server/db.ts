/**
 * RefVox - Legacy in-memory demo data store
 * Production would use PostgreSQL; this in-memory store survives for the session.
 * All business logic enforced server-side.
 *
 * NOTE: Demo environment. All data resets on server restart.
 */

export type UserRole = 'user' | 'admin';
export type ParticipationStatus =
  | 'reserved'
  | 'pending_verification'
  | 'verified'
  | 'rejected'
  | 'disputed'
  | 'expired';
export type OrderStatus = 'active' | 'completed' | 'refunded' | 'cancelled';
export type PaymentStatus = 'pending' | 'released' | 'refunded' | 'disputed';

export interface User {
  id: string;
  xId: string;
  xHandle: string;
  xDisplayName: string;
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
  createdAt: string;
}

export interface Project {
  id: string;
  submittedBy: string;
  name: string;
  description: string;
  officialDomain: string;
  referralLinkPattern: string;
  referralMode: 'url' | 'code';
  validParticipationCondition: string;
  validationMethod: string;
  allowsFreeParticipation: boolean;
  allowsPaidParticipation: boolean;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export interface ReferralLink {
  id: string;
  userId: string;
  projectId: string;
  referralCode: string;
  fullLink: string;
  slotsAllocated: number;
  timesReferred: number;
  queuePosition: number;
  queuedAt: string;
  active: boolean;
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
  createdAt: string;
}

export interface FreeSlotsLedger {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  referenceId: string | null;
  createdAt: string;
  grantedBy: string | null;
}

export interface Order {
  id: string;
  projectId: string;
  buyerId: string;
  packageSize: number;
  pricePerReferral: number;
  platformFeeBps: number;
  totalCost: number;
  slotsUsed: number;
  status: OrderStatus;
  txHash: string | null;
  onchainConfirmed: boolean;
  createdAt: string;
  lockedPricePerReferral: number;
  lockedPlatformFeeBps: number;
}

export interface Payment {
  id: string;
  participationId: string;
  orderId: string;
  recipientId: string;
  participantShare: number;
  platformShare: number;
  status: PaymentStatus;
  txHash: string | null;
  onchainConfirmed: boolean;
  releasedAt: string | null;
  refundedAt: string | null;
  createdAt: string;
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

export interface PlatformConfig {
  freeSlotGrant: number;
  reservationTtlMinutes: number;
}

// ── In-Memory Store ───────────────────────────────────────────────────────────

const users = new Map<string, User>();
const projects = new Map<string, Project>();
const referralLinks = new Map<string, ReferralLink>();
const reservations = new Map<string, Reservation>();
const participations = new Map<string, Participation>();
const freeSlotsLedger: FreeSlotsLedger[] = [];
const orders = new Map<string, Order>();
const payments = new Map<string, Payment>();
const adminLogs: AdminLog[] = [];

const config: PlatformConfig = {
  freeSlotGrant: 5,
  reservationTtlMinutes: 30,
};

// ── Seed Demo Data ─────────────────────────────────────────────────────────────

function seed() {
  const now = new Date().toISOString();

  const admin: User = {
    id: 'user_admin',
    xId: 'demo_admin_x',
    xHandle: 'refbridge_admin',
    xDisplayName: 'RefBridge Admin',
    walletAddress: null, // arc-studio-allow-onchain-literal
    walletVerifiedAt: null,
    freeSlots: 999,
    freeSlotsGrantedAt: now,
    totalFreeParticipations: 99,
    onboardingUnlocked: true,
    pilotFounderAccess: true,
    pilotFounderGrantedBy: 'system',
    pilotFounderGrantedAt: now,
    role: 'admin',
    createdAt: now,
  };
  users.set(admin.id, admin);

  // Demo user at 4/5 — shows 4→5 transition in the demo
  const demoUser: User = {
    id: 'user_demo',
    xId: 'demo_user_x',
    xHandle: 'alice_demo',
    xDisplayName: 'Alice (Demo)',
    walletAddress: null,
    walletVerifiedAt: null,
    freeSlots: 0,
    freeSlotsGrantedAt: null,
    totalFreeParticipations: 4,
    onboardingUnlocked: false,
    pilotFounderAccess: false,
    pilotFounderGrantedBy: null,
    pilotFounderGrantedAt: null,
    role: 'user',
    createdAt: now,
  };
  users.set(demoUser.id, demoUser);

  // Pilot founder user (admin-granted bypass)
  const founderUser: User = {
    id: 'user_founder',
    xId: 'demo_founder_x',
    xHandle: 'bob_founder',
    xDisplayName: 'Bob (Pilot Kurucu)',
    walletAddress: null,
    walletVerifiedAt: null,
    freeSlots: 3,
    freeSlotsGrantedAt: now,
    totalFreeParticipations: 2,
    onboardingUnlocked: true,
    pilotFounderAccess: true,
    pilotFounderGrantedBy: 'user_admin',
    pilotFounderGrantedAt: now,
    role: 'user',
    createdAt: now,
  };
  users.set(founderUser.id, founderUser);

  const projects_data: Project[] = [
    {
      id: 'proj_alpha',
      submittedBy: 'user_admin',
      name: 'AlphaProtocol',
      description: 'DeFi lending protokolü — testnet katılım.',
      officialDomain: 'alphaprotocol.demo',
      referralLinkPattern: 'https://alphaprotocol.demo/join/{code}',
      referralMode: 'url',
      validParticipationCondition: 'Testnet üzerinde en az 1 işlem gerçekleştirmek.',
      validationMethod: 'demo',
      allowsFreeParticipation: true,
      allowsPaidParticipation: true,
      status: 'approved',
      approvedBy: 'user_admin',
      approvedAt: now,
      rejectionReason: null,
      createdAt: now,
    },
    {
      id: 'proj_beta',
      submittedBy: 'user_admin',
      name: 'BetaChain',
      description: 'Layer-2 köprü altyapısı — erken erişim.',
      officialDomain: 'betachain.demo',
      referralLinkPattern: 'https://betachain.demo/ref/{code}',
      referralMode: 'url',
      validParticipationCondition: 'Erken erişim formu doldurmak ve cüzdan bağlamak.',
      validationMethod: 'demo',
      allowsFreeParticipation: true,
      allowsPaidParticipation: true,
      status: 'approved',
      approvedBy: 'user_admin',
      approvedAt: now,
      rejectionReason: null,
      createdAt: now,
    },
    {
      id: 'proj_gamma',
      submittedBy: 'user_founder',
      name: 'GammaDEX',
      description: 'Zincir üstü token takas platformu.',
      officialDomain: 'gammadex.demo',
      referralLinkPattern: 'https://gammadex.demo/invite/{code}',
      referralMode: 'url',
      validParticipationCondition: 'İlk token takasını gerçekleştirmek.',
      validationMethod: 'demo',
      allowsFreeParticipation: true,
      allowsPaidParticipation: false,
      status: 'approved',
      approvedBy: 'user_admin',
      approvedAt: now,
      rejectionReason: null,
      createdAt: now,
    },
    {
      id: 'proj_pending',
      submittedBy: 'user_founder',
      name: 'DeltaVault (Beklemede)',
      description: 'Getiri optimizasyon kasası.',
      officialDomain: 'deltavault.demo',
      referralLinkPattern: 'https://deltavault.demo/r/{code}',
      referralMode: 'url',
      validParticipationCondition: 'Kasa ön kaydı.',
      validationMethod: 'demo',
      allowsFreeParticipation: true,
      allowsPaidParticipation: true,
      status: 'pending',
      approvedBy: null,
      approvedAt: null,
      rejectionReason: null,
      createdAt: now,
    },
  ];
  for (const p of projects_data) projects.set(p.id, p);

  const rl1: ReferralLink = {
    id: 'rl_founder_alpha',
    userId: 'user_founder',
    projectId: 'proj_alpha',
    referralCode: 'BOB-ALPHA-001',
    fullLink: 'https://alphaprotocol.demo/join/BOB-ALPHA-001',
    slotsAllocated: 2,
    timesReferred: 1,
    queuePosition: 1,
    queuedAt: now,
    active: true,
  };
  const rl2: ReferralLink = {
    id: 'rl_founder_beta',
    userId: 'user_founder',
    projectId: 'proj_beta',
    referralCode: 'BOB-BETA-001',
    fullLink: 'https://betachain.demo/ref/BOB-BETA-001',
    slotsAllocated: 1,
    timesReferred: 0,
    queuePosition: 2,
    queuedAt: now,
    active: true,
  };
  referralLinks.set(rl1.id, rl1);
  referralLinks.set(rl2.id, rl2);

  // Alice has 4 verified free participations
  const demoParticipations = [
    { id: 'part_demo_1', projectId: 'proj_alpha', rlId: 'rl_founder_alpha' },
    { id: 'part_demo_2', projectId: 'proj_beta', rlId: 'rl_founder_beta' },
    { id: 'part_demo_3', projectId: 'proj_gamma', rlId: 'rl_founder_alpha' },
    { id: 'part_demo_4', projectId: 'proj_alpha', rlId: 'rl_founder_alpha' },
  ];
  for (const dp of demoParticipations) {
    const p: Participation = {
      id: dp.id,
      reservationId: `res_${dp.id}`,
      participantId: 'user_demo',
      referrerId: 'user_founder',
      projectId: dp.projectId,
      referralLinkId: dp.rlId,
      participationType: 'free',
      orderId: null,
      submittedProof: null,
      status: 'verified',
      verifiedBy: 'demo',
      verifiedAt: now,
      rejectionReason: null,
      disputedAt: null,
      disputeNote: null,
      createdAt: now,
    };
    participations.set(p.id, p);
  }

  const demoOrder: Order = {
    id: 'order_demo_1',
    projectId: 'proj_alpha',
    buyerId: 'user_founder',
    packageSize: 10,
    pricePerReferral: 1_000_000,
    platformFeeBps: 5000,
    totalCost: 10_000_000,
    slotsUsed: 1,
    status: 'active',
    txHash: null,
    onchainConfirmed: false,
    createdAt: now,
    lockedPricePerReferral: 1_000_000,
    lockedPlatformFeeBps: 5000,
  };
  orders.set(demoOrder.id, demoOrder);
}

seed();

export const db = {
  config,
  users,
  projects,
  referralLinks,
  reservations,
  participations,
  freeSlotsLedger,
  orders,
  payments,
  adminLogs,

  getUser: (id: string) => users.get(id),
  getUserByXId: (xId: string) => [...users.values()].find(u => u.xId === xId),

  logAdmin: (adminId: string, action: string, targetType: string, targetId: string, details: string) => {
    adminLogs.push({
      id: `al_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      adminId,
      action,
      targetType,
      targetId,
      details,
      createdAt: new Date().toISOString(),
    });
  },
};
