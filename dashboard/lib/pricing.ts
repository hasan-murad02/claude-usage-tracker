// USD per million tokens. These are ESTIMATES used only for the cost columns:
// check them against https://www.anthropic.com/pricing and edit as needed.
// First matching pattern wins, so keep specific patterns above general ones.
type Price = { input: number; output: number };

const PRICES: { match: RegExp; price: Price }[] = [
  { match: /opus-(4-5|5)/, price: { input: 5, output: 25 } },
  { match: /opus/, price: { input: 15, output: 75 } },
  { match: /fable/, price: { input: 5, output: 25 } },
  { match: /sonnet/, price: { input: 3, output: 15 } },
  { match: /haiku-3-5/, price: { input: 0.8, output: 4 } },
  { match: /haiku-3/, price: { input: 0.25, output: 1.25 } },
  { match: /haiku/, price: { input: 1, output: 5 } },
];

const FALLBACK: Price = { input: 3, output: 15 };
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export type Tokens = { input: number; output: number; cacheWrite: number; cacheRead: number };

export function cost(model: string, t: Tokens) {
  const p = PRICES.find((x) => x.match.test(model))?.price ?? FALLBACK;
  return (
    (t.input * p.input +
      t.output * p.output +
      t.cacheWrite * p.input * CACHE_WRITE_MULTIPLIER +
      t.cacheRead * p.input * CACHE_READ_MULTIPLIER) /
    1e6
  );
}
