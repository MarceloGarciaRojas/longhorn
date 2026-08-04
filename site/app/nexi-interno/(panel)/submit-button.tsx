"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className = "admin-button",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? "Procesando…" : children}
    </button>
  );
}
