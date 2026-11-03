import {Link,useSearchParams} from 'react-router-dom';
import {CircleWalletPanel} from '../components/CircleWalletPanel';
import {normalizeLoginReturn} from '../auth-return';
import {useI18n} from '../i18n';

export function WalletSetupPage(){const {language}=useI18n(),[params]=useSearchParams();let next=normalizeLoginReturn(params.get('continue')||'/finance');if(next.startsWith('/wallet/setup'))next='/finance';return <><CircleWalletPanel/><nav className="cg-gateway" aria-label={language==='en'?'Continue to CARPAN':'CARPAN’a devam et'}><Link className="cg-wallet-login" to={next}>{language==='en'?'Continue to CARPAN':'CARPAN’a devam et'} →</Link></nav></>;}
