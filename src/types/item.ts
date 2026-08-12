export type CheckResult = "pass" | "pass-alt" | "partial" | "fail";

export type ApiCheck =
  | { type: "combat-achievement"; tier: string }
  | { type: "quest-cape" }
  | { type: "quest"; name: string }
  | { type: "diary-cape" }
  | { type: "total-level"; required: number }
  | { type: "skill-level"; skill: string; required: number }
  | { type: "collection-item"; names: string[] }
  | { type: "collection-count"; names: string[]; required: number }
  | {
      type: "collection-quantity";
      name: string;
      required: number;
      displayTotal?: number;
    }
  | { type: "collection-any-group"; groups: string[][]; required: number }
  | { type: "collection-full-groups"; groups: string[][]; required: number }
  | { type: "collection-all-plus-any"; all: string[]; any: string[] }
  | { type: "collection-any-of"; primary: ApiCheck; alternatives: ApiCheck[] }
  | { type: "combat-achievement-task"; names: string[] }
  | {
      type: "collection-piece-types";
      pieceGroups: string[][];
      required: number;
    }
  | { type: "collection-all-checks"; checks: ApiCheck[] }
  | { type: "collection-masori-f" };

export type Item = {
  name: string;
  img: string;
  alt: string;
  multiItem?: boolean;
  apiCheck?: ApiCheck;
};
