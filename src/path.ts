export function trimSuffix(input: string, suffix: string): string {
  if (input.endsWith(suffix)) {
    return input.substring(0, input.length - suffix.length);
  }

  return input;
}
