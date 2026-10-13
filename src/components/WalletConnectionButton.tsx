import { ConnectKitButton } from 'connectkit';
import { Wallet } from 'lucide-react';
import { useI18n } from '../i18n';

/** Carpan presentation for the existing ConnectKit chooser/profile action. */
export function WalletConnectionButton() {
  const { t } = useI18n();
  return <ConnectKitButton.Custom>{({ show, isConnected, isConnecting, truncatedAddress }) => (
    <button type="button" className="cp-button cp-button--primary cp-wallet-connect"
      disabled={!show || isConnecting} onClick={show}>
      <Wallet size={16} aria-hidden="true" />
      {isConnected && truncatedAddress ? truncatedAddress : t('Cüzdanını bağla')}
    </button>
  )}</ConnectKitButton.Custom>;
}
