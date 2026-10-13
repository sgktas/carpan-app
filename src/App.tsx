/* carpan-localized */
import { useI18n } from './i18n/index';
import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthContext, useAuthProvider } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { CarpanFooter } from './components/CarpanFooter';
import { CarpanLoginProvider } from './components/CarpanLogin';
import { RouteScroll } from './components/RouteScroll';
import { CarpanLandingPage } from './pages/CarpanLandingPage';
import {CarpanLoadingOverlay, CarpanPageLoading} from './components/CarpanLoadingOverlay';
import {withPageLoading} from './hooks/usePageLoading';
const pageLazy: typeof React.lazy = factory => React.lazy(() => Promise.resolve().then(() => withPageLoading(factory)));

const ProductOverviewPage=pageLazy(()=>import('./pages/ProductOverviewPage').then(m=>({default:m.ProductOverviewPage})));
const LegalPage=pageLazy(()=>import('./pages/LegalPage').then(m=>({default:m.LegalPage})));
const ApiPage=pageLazy(()=>import('./pages/ApiPage').then(m=>({default:m.ApiPage})));
const SettingsPage = pageLazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const ProjectsPage = pageLazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const MyLinksPage = pageLazy(() => import('./pages/MyLinksPage').then(m => ({ default: m.MyLinksPage })));
const ReferralCenterPage = pageLazy(() => import('./pages/ReferralCenterPage').then(m => ({ default: m.ReferralCenterPage })));
const ParticipationsPage = pageLazy(() => import('./pages/ParticipationsPage').then(m => ({ default: m.ParticipationsPage })));
const IncomingPage = pageLazy(() => import('./pages/IncomingPage').then(m => ({ default: m.IncomingPage })));
const AdminPage = pageLazy(() => import('./pages/AdminPage').then(m => ({ default: m.AdminPage })));
const EscrowTestPage = import.meta.env.DEV ? pageLazy(() => import('./pages/EscrowTestPage').then(m => ({ default: m.EscrowTestPage }))) : null;
const ArcToolsPage = pageLazy(() => import('./pages/ArcToolsPage').then(m => ({ default: m.ArcToolsPage })));
const FinancePage = pageLazy(() => import('./pages/FinancePage').then(m => ({ default: m.FinancePage })));
const CollectionsPage = pageLazy(() => import('./pages/CollectionsPage').then(m => ({ default: m.CollectionsPage })));
const CollectionPaymentPage = pageLazy(() => import('./pages/CollectionsPage').then(m => ({ default: m.CollectionPaymentPage })));
const ArcRadarPage = pageLazy(() => import('./pages/ArcRadarPage').then(m => ({ default: m.ArcRadarPage })));
const ArcContractPage = pageLazy(() => import('./pages/ArcContractPage').then(m => ({ default: m.ArcContractPage })));
const ArcAddressPage = pageLazy(() => import('./pages/ArcWalletPage').then(m => ({ default: m.ArcWalletPage })));

const EcosystemPage = pageLazy(() => import('./pages/EcosystemPage').then(m => ({ default: m.EcosystemPage })));
function ArcEntryRoute() {
  const location = useLocation();
  const paymentRequest = new URLSearchParams(location.search);
  if (paymentRequest.has('to') && paymentRequest.has('amount')) {
    return <Navigate to={`/arc/tools${location.search}`} replace />;
  }
  return <ArcRadarPage />;
}

function LegacyAccountRoute(){
  const {hash}=useLocation();
  return <Navigate to={hash==='#account'?'/settings?tab=security#account':'/settings?tab=profile'} replace/>;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const auth = useAuthProvider();
  if (auth.loading) return <CarpanPageLoading/>;
  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const auth = React.useContext(AuthContext);
  const location = useLocation();
  if (!auth.user) return <Navigate to={`/?login=1&next=${encodeURIComponent(location.pathname + location.search + location.hash)}`} replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  useI18n();
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RouteScroll />
      <CarpanLoadingOverlay/>
      <AuthGate>
        <CarpanLoginProvider>
        <Suspense fallback={<CarpanPageLoading/>}>
        <Routes>
          <Route path="/" element={<CarpanLandingPage />} />
          <Route path="/privacy" element={<LegalPage kind="privacy" />} />
          <Route path="/terms" element={<LegalPage kind="terms" />} />
          <Route path="/login" element={null} />
          <Route path="/register" element={null} />
          <Route path="/about" element={<ProductOverviewPage/>} />
          <Route path="/developers" element={<ApiPage/>} />
          <Route path="/profile" element={<LegacyAccountRoute/>} />
          <Route path="/settings" element={<Layout><SettingsPage /></Layout>} />
          <Route path="/arc" element={<ArcEntryRoute />} />
          <Route path="/ecosystem/:id?" element={<EcosystemPage />} />
          <Route path="/onchain/projects/:id?" element={<EcosystemPage />} />
          <Route path="/arc/addresses/:address" element={<ArcAddressPage />} />
          <Route path="/arc/contracts/:address" element={<ArcContractPage />} />
          <Route path="/arc/tools" element={<ArcToolsPage />} />
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/finance/collections" element={<CollectionsPage />} />
          <Route path="/pay/:token" element={<CollectionPaymentPage />} />
          <Route path="/dashboard" element={<LegacyAccountRoute/>} />
          <Route path="/projects" element={<ProtectedRoute><ProjectsPage /></ProtectedRoute>} />
          <Route path="/my-links" element={<ProtectedRoute><MyLinksPage /></ProtectedRoute>} />
          <Route path="/referral-center" element={<ProtectedRoute><ReferralCenterPage /></ProtectedRoute>} />
          <Route path="/participations" element={<ProtectedRoute><ParticipationsPage /></ProtectedRoute>} />
          <Route path="/incoming" element={<ProtectedRoute><IncomingPage /></ProtectedRoute>} />
          {/* Keep old bookmarks working while sending users to the free product flow. */}
          <Route path="/packages" element={<Navigate to="/my-links" replace />} />
          <Route path="/usdc" element={<Navigate to="/settings?tab=profile" replace />} />
          <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          {EscrowTestPage && <Route path="/escrow-test" element={<ProtectedRoute><EscrowTestPage /></ProtectedRoute>} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        <CarpanFooter />
        </CarpanLoginProvider>
      </AuthGate>
    </BrowserRouter>
  );
}
