export default function generateOTP() {
  const randomBytes = new Uint8Array(6);
  crypto.getRandomValues(randomBytes);
  let otp = "";
  for (let i = 0; i < 6; i += 1) {
    otp += (randomBytes[i]! % 10).toString();
  }
  return otp;
}
