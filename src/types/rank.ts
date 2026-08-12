import type { Item } from "./item.js";

export type Rank = {
  name: string;
  color: string;
  textColor: string;
  icon: string;
  items: Item[];
};
