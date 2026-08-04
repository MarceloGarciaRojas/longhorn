"use client";

import { useFormStatus } from "react-dom";

export function OperationSubmit({
  children,
  className,
  pendingLabel = "Guardando…",
  confirmMessage,
}: {
  children: string;
  className: string;
  pendingLabel?: string;
  confirmMessage?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      aria-disabled={pending}
      onClick={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
