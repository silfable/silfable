import React from "react";

export function Notice({
  tone,
  title,
  children,
}: {
  tone: "info" | "warning" | "danger";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`notice ${tone}`}>
      <span>{tone === "danger" ? "!" : tone === "warning" ? "△" : "i"}</span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  children: React.ReactNode;
}) {
  return <span className={`statusPill ${tone}`}>{children}</span>;
}
