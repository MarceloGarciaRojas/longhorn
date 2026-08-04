import {
  parseRestaurantContent,
  validateRestaurantContent,
} from "./restaurant-schema";
import {
  parseRestaurantV2Content,
  validateRestaurantV2Content,
} from "./restaurant-v2-schema";
import {
  RESTAURANT_SCHEMA_KEY,
  RESTAURANT_SCHEMA_VERSION,
  RESTAURANT_V2_SCHEMA_KEY,
  RESTAURANT_V2_SCHEMA_VERSION,
  type RestaurantAnyContent,
} from "./types";

export function validateContentForSchema(
  schemaKey: string,
  schemaVersion: number,
  content: unknown,
  mode: "draft" | "publication",
): RestaurantAnyContent {
  if (
    schemaKey === RESTAURANT_SCHEMA_KEY &&
    schemaVersion === RESTAURANT_SCHEMA_VERSION
  ) return validateRestaurantContent(content, mode);
  if (
    schemaKey === RESTAURANT_V2_SCHEMA_KEY &&
    schemaVersion === RESTAURANT_V2_SCHEMA_VERSION
  ) return validateRestaurantV2Content(content, mode);
  throw new Error("schema_unavailable");
}

export function parseContentForSchema(
  schemaKey: string,
  schemaVersion: number,
  serialized: string,
  mode: "draft" | "publication",
): RestaurantAnyContent {
  if (
    schemaKey === RESTAURANT_SCHEMA_KEY &&
    schemaVersion === RESTAURANT_SCHEMA_VERSION
  ) return parseRestaurantContent(serialized, mode);
  if (
    schemaKey === RESTAURANT_V2_SCHEMA_KEY &&
    schemaVersion === RESTAURANT_V2_SCHEMA_VERSION
  ) return parseRestaurantV2Content(serialized, mode);
  throw new Error("schema_unavailable");
}
