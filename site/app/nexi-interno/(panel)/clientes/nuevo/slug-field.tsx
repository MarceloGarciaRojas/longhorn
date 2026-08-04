"use client";

import { useState } from "react";

function normalizeSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function SlugField() {
  const [slug, setSlug] = useState("");
  return (
    <label>
      <span>Dirección propuesta</span>
      <input
        name="slug"
        value={slug}
        onChange={(event) => setSlug(normalizeSlug(event.target.value))}
        required
        minLength={3}
        maxLength={63}
        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
        placeholder="nombre-empresa"
        autoComplete="off"
      />
      <small className="field-hint">
        Vista previa: https://{slug || "nombre-empresa"}.nexi.cl
      </small>
    </label>
  );
}
