// import { isStrongPassword } from "validator";

export default function validatePasswordStrength(password: string) {
  // TODO: add validation. No internet to pull in dependencies now
  return password.length >= 8;
  // return isStrongPassword(password, {
  //   minLength: 8,
  //   minLowercase: 1,
  //   minUppercase: 1,
  //   minNumbers: 1,
  //   minSymbols: 1,
  //   returnScore: false,
  //   pointsPerUnique: 1,
  //   pointsPerRepeat: 0.5,
  //   pointsForContainingLower: 10,
  //   pointsForContainingUpper: 10,
  //   pointsForContainingNumber: 10,
  //   pointsForContainingSymbol: 10,
  // });
}
