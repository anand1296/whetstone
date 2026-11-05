/** Topics with fewer published questions than this say "more questions are coming". */
export const GROWING_BELOW = 10;

export function isGrowing(questionCount: number): boolean {
  return questionCount < GROWING_BELOW;
}
