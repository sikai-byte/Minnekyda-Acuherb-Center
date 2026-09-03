import Image from 'next/image';

/// The clinic's own artwork, traced from the printable logo file: `Mark` is the leaf on its own
/// for headers and the browser tab, `Lockup` is the full logo with the wordmark for the screens
/// a patient meets the clinic on. Both are vector, so they stay sharp on an iPad.
const MARK_RATIO = 684 / 457;
const LOCKUP_RATIO = 1675 / 939;

export function BrandMark({ height = 28, className }: { height?: number; className?: string }) {
  return (
    <Image
      src="/brand/minnekyda-mark.svg"
      alt=""
      width={Math.round(height * MARK_RATIO)}
      height={height}
      className={className}
      unoptimized
      priority
    />
  );
}

export function BrandLockup({ width = 240, className }: { width?: number; className?: string }) {
  return (
    <Image
      src="/brand/minnekyda-logo.svg"
      alt="Minnekyda Acuherb Center"
      width={width}
      height={Math.round(width / LOCKUP_RATIO)}
      className={className}
      unoptimized
      priority
    />
  );
}

/// The header form of the brand: the mark beside the name, so a narrow iPad header stays legible
/// where the full lockup would have to shrink to nothing.
export function BrandWordmark() {
  return (
    <span className="flex items-center gap-2 text-lg font-semibold tracking-tight text-clay-900">
      <BrandMark height={26} />
      <span>
        Minnekyda <span className="text-moss-600">Acuherb</span>
      </span>
    </span>
  );
}
