import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validator that ensures the email contains a valid TLD (e.g. .com, .org).
 * Use alongside Validators.email. Fails when the domain has no dot or the part after the last dot is shorter than 2 characters.
 */
export function emailTldValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (value == null || value === '') {
      return null;
    }
    const str = String(value).trim();
    const atIndex = str.indexOf('@');
    if (atIndex === -1) {
      return null; // Let Validators.email handle invalid format
    }
    const domain = str.slice(atIndex + 1);
    const lastDot = domain.lastIndexOf('.');
    if (lastDot === -1) {
      return { email: true };
    }
    const tld = domain.slice(lastDot + 1);
    if (tld.length < 2) {
      return { email: true };
    }
    return null;
  };
}
