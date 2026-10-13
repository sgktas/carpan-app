/* carpan-localized */
import { t } from '../i18n/index';
import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import {announceAuthChange,subscribeAuthRefresh} from '../auth-tab-sync';
import { api } from '../api';
import type { User, AccountSession } from '../types';

interface AuthState {
  user: User | null;
  session: AccountSession | null;
  demoMode: boolean;
  xLoginAvailable: boolean;
  googleLoginAvailable: boolean;
  emailLoginAvailable: boolean;
  loading: boolean;
  authError: string;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthState>({
  user: null,
  session: null,
  demoMode: false,
  xLoginAvailable: false,
  googleLoginAvailable: false,
  emailLoginAvailable: false,
  loading: true,
  authError: '',
  logout: async () => {},
  refresh: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthProvider(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [session,setSession]=useState<AccountSession|null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [xLoginAvailable, setXLoginAvailable] = useState(false);
  const [googleLoginAvailable, setGoogleLoginAvailable] = useState(false);
  const [emailLoginAvailable, setEmailLoginAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const requestGeneration=useRef(0);

  const loadAuth = useCallback(async () => {
    const generation=++requestGeneration.current;
    try {
      const status = await api.authStatus();
      if(generation!==requestGeneration.current)return false;
      setUser(status.authenticated ? status.user : null);
      setSession(status.authenticated?status.session??null:null);
      setDemoMode(status.demoMode);
      setXLoginAvailable(status.xLoginAvailable);
      setGoogleLoginAvailable(status.googleLoginAvailable);
      setEmailLoginAvailable(status.emailLoginAvailable);
      setAuthError('');
      return true;
    } catch {
      if(generation!==requestGeneration.current)return false;
      // A temporary API error is not proof that an existing session ended.
      setAuthError(t("Hesap servisine ulaşılamadı. Bağlantıyı tekrar deneyin."));
      return false;
    } finally {
      if(generation===requestGeneration.current)setLoading(false);
    }
  }, []);

  const refresh=useCallback(async()=>{if(await loadAuth())announceAuthChange();},[loadAuth]);
  useEffect(() => {
    void loadAuth().then(ok=>{if(ok)announceAuthChange();});
    const unsubscribe=subscribeAuthRefresh(()=>{void loadAuth();});
    return()=>{unsubscribe();requestGeneration.current++;};
  }, [loadAuth]);

  const logout = async () => {
    await api.logout();
    requestGeneration.current++;
    setUser(null);
    setSession(null);
    announceAuthChange();
  };

  return { user, session, demoMode, xLoginAvailable, googleLoginAvailable, emailLoginAvailable, loading, authError, logout, refresh };
}
