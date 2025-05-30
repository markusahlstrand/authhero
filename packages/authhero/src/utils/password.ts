import { passwordStrength } from "check-password-strength";

export default function validatePasswordStrength(password: string) {
  // Check overall strength with zxcvbn
  if (passwordStrength(password).id < 2) return false;

  // Additional complexity rules.
  return (
    password.length >= 8 && // Minimum length
    /[a-z]/.test(password) && // At least one lowercase letter
    /[A-Z]/.test(password) && // At least one uppercase letter
    /[0-9]/.test(password) && // At least one number
    /[^A-Za-z0-9]/.test(password) // At least one special character
  );
}
