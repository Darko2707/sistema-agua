export const REPRESENTATIVE_RESET_CODE_LENGTH = 6;

const REPRESENTATIVE_RESET_CODE_PATTERN = /^[0-9]{6}$/;

/**
 * Client-side input filter. Invalid characters never become part of the
 * visible value, while the server still rejects an unfiltered invalid input.
 */
export function filterRepresentativeResetCodeInput(input: string): string {
  return input.replace(/[^0-9]/g, '').slice(0, REPRESENTATIVE_RESET_CODE_LENGTH);
}

export function isRepresentativeResetCodeValid(input: string): boolean {
  return REPRESENTATIVE_RESET_CODE_PATTERN.test(input);
}
