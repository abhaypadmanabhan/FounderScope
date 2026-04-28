// Brand mark — concentric rings echoing the moat/replicability dial.
export function Logomark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="9.5" stroke="var(--text-faint)" strokeOpacity="0.5" />
      <circle cx="11" cy="11" r="5.5" stroke="var(--text-muted)" strokeOpacity="0.7" />
      <circle cx="11" cy="11" r="2.2" fill="var(--accent-color)" />
    </svg>
  );
}
