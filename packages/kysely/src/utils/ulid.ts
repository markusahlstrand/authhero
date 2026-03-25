const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now: number): string {
  let str = "";
  for (let i = TIME_LEN; i > 0; i--) {
    str = ENCODING.charAt(now % ENCODING_LEN) + str;
    now = Math.floor(now / ENCODING_LEN);
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

export function ulid(): string {
  return encodeTime(Date.now()) + encodeRandom();
}
