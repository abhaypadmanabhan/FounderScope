// Brand mark — the amber brushstroke "F", isolated on transparent so it reads
// on any surface. The full squircle (black tile) lives in the favicon/app-icon.
export function Logomark({ size = 22 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/founderscope-mark.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
        flexShrink: 0,
      }}
    />
  );
}
