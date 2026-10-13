// Legacy imports resolve to the profile; no dashboard data or referral polling.
import {Navigate,useLocation} from 'react-router-dom';
export function DashboardPage(){const {hash}=useLocation();return <Navigate to={hash==='#account'?'/settings?tab=security#account':'/settings?tab=profile'} replace/>;}
