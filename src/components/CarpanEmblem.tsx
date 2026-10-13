/** Three flowing forms: data, intelligence, action. Text beside it supplies the name. */
export function CarpanEmblem({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/carpan-emblem.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      style={{ display: 'block', width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
    />
  );
}
