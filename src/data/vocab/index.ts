import type { Deck, DeckId, VocabItem } from '../types';
import { n5 } from './n5';
import { n4 } from './n4';
import { n4plus } from './n4plus';
import { travel } from './travel';
import { business } from './business';
import { anime } from './anime';
import { course } from './course';

export const DECKS: Deck[] = [n5, n4, n4plus, travel, business, anime, course];

export function deckById(id: string): Deck | undefined {
  return DECKS.find((d) => d.id === id);
}

const ITEM_INDEX = new Map<string, { item: VocabItem; deck: DeckId }>();
for (const d of DECKS) for (const item of d.items) ITEM_INDEX.set(item.id, { item, deck: d.id });

export function vocabById(id: string): VocabItem | undefined {
  return ITEM_INDEX.get(id)?.item;
}
