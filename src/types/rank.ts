import type { Item } from "./item";

export type Rank = {
  name: string;
  color: string;
  textColor: string;
  icon: string;
  items: Item[];
};
