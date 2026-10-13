import './arc-network-icon.css';

type ArcNetworkIconProps = {
  className?: string;
};

/** Official, unmodified Arc network asset; the adjacent label names the network. */
export function ArcNetworkIcon({ className = '' }: ArcNetworkIconProps) {
  return <span className={`arc-network-icon ${className}`.trim()} aria-hidden="true">
    <img src="/images/networks/arc-network.svg" alt="" aria-hidden="true"
      width={28} height={28} draggable={false} />
  </span>;
}
