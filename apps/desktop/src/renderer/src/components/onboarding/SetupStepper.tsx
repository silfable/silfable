export const SETUP_STEPS = [
  "Security",
  "Wallets",
  "Integrations",
  "Agent core",
  "Provider",
  "Review",
];

export function SetupStepper({ current }: { current: number }) {
  return (
    <nav className="setupStepper" aria-label="Setup progress">
      {SETUP_STEPS.map((label, index) => (
        <div
          className={
            index === current ? "active" : index < current ? "done" : ""
          }
          key={label}
        >
          <span>
            {index < current ? "✓" : String(index + 1).padStart(2, "0")}
          </span>
          <small>{label}</small>
        </div>
      ))}
    </nav>
  );
}
