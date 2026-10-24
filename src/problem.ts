import { codePoints } from "./text";

export interface Problem {
  col: number;
  code: string;
  text: string;
}

export function sortedProblems(found: Problem[]): Problem[] {
  return found
    .map((problem, order) => ({ problem, order }))
    .sort((left, right) => {
      const columnOrder = left.problem.col - right.problem.col;
      if (columnOrder !== 0) {
        return columnOrder;
      }

      const codeOrder = compareCodes(left.problem.code, right.problem.code);
      return codeOrder !== 0 ? codeOrder : left.order - right.order;
    })
    .map(({ problem }) => problem);
}

export function render(display: string, line: number, problem: Problem): string {
  return `${display}:${line}:${problem.col}: ${problem.code} ${problem.text}`;
}

function compareCodes(left: string, right: string): number {
  const leftPoints = codePoints(left);
  const rightPoints = codePoints(right);
  const sharedLength = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const leftCode = leftPoints[index]?.codePointAt(0) ?? 0;
    const rightCode = rightPoints[index]?.codePointAt(0) ?? 0;
    if (leftCode !== rightCode) {
      return leftCode - rightCode;
    }
  }

  return leftPoints.length - rightPoints.length;
}
