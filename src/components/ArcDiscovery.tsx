import {t as translateText} from '../i18n/index';
/* carpan-localized */
import { t } from '../i18n/index';
import {Link} from 'react-router-dom';
import {ArrowUpRight,ExternalLink} from 'lucide-react';
import {ARC_USDC} from '../arc-wallet';

const explorer='https://explorer.arc.io';

export function ArcTokenModule(){return <section className="at-token-module"><div className="at-token-heading"><span className="at-large-usdc">$</span><div><span>{t("ARC MAINNET · TOKEN PROFİLİ")}</span><h1>USDC <small>USD Coin</small></h1></div></div><div className="at-token-details"><div><span>{t("KONTRAT")}</span><code>{ARC_USDC}</code></div><div><span>{translateText("ONDALIK")}</span><strong>6</strong></div><div><span>{t("AĞ")}</span><strong>Arc Mainnet</strong></div></div><p>{t("Arc üzerindeki USDC bakiye ve transferlerini araştır.")}</p><Link to="/arc">{t("Transfer akışını aç")}<ArrowUpRight size={16}/></Link><a href={`${explorer}/token/${ARC_USDC}`} target="_blank" rel="noopener noreferrer">{t("Tokenı Explorer’da incele")}<ExternalLink size={15}/></a></section>;}


