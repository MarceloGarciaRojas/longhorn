export function visiblePulsoClassIndexes(
  itemCategoryIds: readonly string[],
  selectedCategoryId: string,
): number[] {
  return itemCategoryIds.flatMap((categoryId, index) =>
    selectedCategoryId === "all" || categoryId === selectedCategoryId
      ? [index]
      : []
  );
}
