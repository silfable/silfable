import logoUrl from "../../assets/logo-bg.jpeg";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`setupBrand ${compact ? "compact" : ""}`}>
      <BrandMark />
      <div>
        <strong>Silfable</strong>
        <small>Mainnet intelligence</small>
      </div>
    </div>
  );
}

export function BrandMark({ large = false }: { large?: boolean }) {
  return (
    <span className={`brandMark ${large ? "large" : ""}`}>
      <img
        src={logoUrl}
        alt="Silfable Logo"
        style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "inherit" }}
      />
    </span>
  );
}

export function CornerFooter() {
  return (
    <div className="cornerFooter">
      <span>Local-first · policy enforced</span>
      <span>MAINNET</span>
    </div>
  );
}
