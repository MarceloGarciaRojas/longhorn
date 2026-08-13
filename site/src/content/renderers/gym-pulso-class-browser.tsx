"use client";

import { useId, useState, type ReactNode } from "react";
import { visiblePulsoClassIndexes } from "./gym-pulso-class-filter";
import styles from "./gym-pulso.module.css";

export interface PulsoClassFilterCategory {
  id: string;
  name: string;
}

export interface PulsoClassBrowserProps {
  categories: readonly PulsoClassFilterCategory[];
  itemCategoryIds: readonly string[];
  items: readonly ReactNode[];
}

export function GymPulsoClassBrowser({
  categories,
  itemCategoryIds,
  items,
}: PulsoClassBrowserProps) {
  const [selectedCategoryId, setSelectedCategoryId] = useState("all");
  const resultsId = useId();
  const visibleIndexes = visiblePulsoClassIndexes(
    itemCategoryIds,
    selectedCategoryId,
  );
  const filters = [{ id: "all", name: "Todas" }, ...categories];

  return (
    <div>
      <div
        className={styles.filterTabs}
        role="tablist"
        aria-label="Filtrar clases por categoría"
      >
        {filters.map((filter) => (
          <button
            key={filter.id}
            type="button"
            role="tab"
            aria-selected={selectedCategoryId === filter.id}
            aria-controls={resultsId}
            onClick={() => setSelectedCategoryId(filter.id)}
          >
            {filter.name}
          </button>
        ))}
      </div>
      <p className={styles.filterStatus} aria-live="polite">
        {visibleIndexes.length} {visibleIndexes.length === 1 ? "clase" : "clases"}
      </p>
      <div
        id={resultsId}
        className={styles.classGrid}
        role="tabpanel"
        tabIndex={0}
      >
        {visibleIndexes.map((index) => items[index])}
      </div>
    </div>
  );
}
