/**
 * Return the indexes selected by a slice, in visitation order.
 *
 * Bounds are assumed to be validated safe integers when present. Omitted bounds
 * are kept distinct from explicit -1 until the step direction is known.
 */
export function sliceIndexes(
  start: number | null,
  end: number | null,
  step: number | null,
  length: number,
): number[] {
  const stride = step ?? 1;
  if (stride === 0 || length === 0) {
    return [];
  }

  let first: number;
  let stop: number;
  if (stride > 0) {
    first = start === null ? 0 : start < 0 ? start + length : start;
    stop = end === null ? length : end < 0 ? end + length : end;
    first = Math.min(Math.max(first, 0), length);
    stop = Math.min(Math.max(stop, 0), length);
  } else {
    first = start === null ? length - 1 : start < 0 ? start + length : start;
    stop = end === null ? -1 : end < 0 ? end + length : end;
    first = Math.min(Math.max(first, -1), length - 1);
    stop = Math.min(Math.max(stop, -1), length - 1);
  }

  const indexes: number[] = [];
  if (stride > 0) {
    for (let index = first; index < stop; index += stride) {
      indexes.push(index);
    }
  } else {
    for (let index = first; index > stop; index += stride) {
      indexes.push(index);
    }
  }
  return indexes;
}
