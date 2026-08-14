/* global React */

/* ============================================================
   PICTURE COMPONENT
   - Serves AVIF -> WebP -> original JPG/PNG via <picture>.
   - The .avif and .webp siblings are produced at build time by
     scripts/optimize-images.js, so we derive their paths by
     swapping the extension on `src`.
   - Accepts the same props as <img>; defaults match the rest
     of the site (lazy + async).
   ============================================================ */

function Picture({
  src,
  alt,
  width,
  height,
  loading = "lazy",
  decoding = "async",
  fetchPriority,
  // `sizes` is intentionally not forwarded: it is only valid alongside a
  // width-descriptor srcset, which this single-candidate <picture> has none of,
  // so applying it to the <img> is an HTML validation error with no effect.
  sizes,
  className,
}) {
  if (!src) return null;
  if (!/\.(jpe?g|png)$/i.test(src)) {
    return <img src={src} alt={alt} width={width} height={height}
                loading={loading} decoding={decoding}
                fetchPriority={fetchPriority} className={className} />;
  }
  const base = src.replace(/\.(jpe?g|png)$/i, "");

  return (
    <picture>
      <source srcSet={`${base}.avif`} type="image/avif" />
      <source srcSet={`${base}.webp`} type="image/webp" />
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
        className={className}
      />
    </picture>
  );
}

window.Picture = Picture;
