/* carpan-localized */
import { t } from '../i18n/index';
import {Link} from 'react-router-dom';

export function CarpanProductNavigation(){
  return <nav className="carpan-products" aria-label={t("Carpan ürünleri")}>
    <Link className="carpan-product-trigger" to="/finance">{t("Finans")}</Link>
    <Link className="carpan-product-trigger" to="/arc">{t("Terminal")}</Link>
    <Link className="carpan-product-trigger" to="/ecosystem">{t("Ecosystem")}</Link>
    <Link className="carpan-product-trigger" to="/developers">API</Link>
  </nav>;
}
