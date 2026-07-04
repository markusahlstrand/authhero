const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const SEQ_LEN = 4;
const RANDOM_LEN = 10;

function encodeBase32(value: number, length: number): string {
  let str = "";
  for (let i = length; i > 0; i--) {
    str = ENCODING.charAt(value % ENCODING_LEN) + str;
    value = Math.floor(value / ENCODING_LEN);
  }
  return str;
}

function encodeRandom(): string {
  const buffer = new Uint8Array(RANDOM_LEN);
  crypto.getRandomValues(buffer);
  let str = "";
  for (let i = 0; i < RANDOM_LEN; i++) {
    str += ENCODING.charAt(buffer[i]! % ENCODING_LEN);
  }
  return str;
}

let lastTime = 0;
let seq = 0;

/**
 * Lexicographically sortable id that is strictly increasing within a
 * process, even for ids generated in the same millisecond (a per-ms
 * sequence follows the time component). Used for append-only logs where
 * insertion order must survive an `ORDER BY id` tiebreak — `created_at`
 * only has millisecond precision.
 */
export function monotonicId(): string {
  const now = Date.now();
  if (now === lastTime) {
    seq++;
  } else {
    lastTime = now;
    seq = 0;
  }
  return (
    encodeBase32(now, TIME_LEN) + encodeBase32(seq, SEQ_LEN) + encodeRandom()
  );
}
