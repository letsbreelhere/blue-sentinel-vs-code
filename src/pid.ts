export type Pid = [number, number][] & { readonly __tag: unique symbol };

// Chosen by comparison with instant.nvim. Can be adjusted; this is just the PID chosen for the document end marker.
export const MAX_PID: number = 100000000000;

export class PidOrderingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PidOrderingError';
  }
}

export function make(uid: number, clientId: number): Pid {
  return [[uid, clientId]] as Pid;
}

export function serializable(pid: Pid): [number, number][] {
  return pid.map((pid) => [Number(pid[0]), Number(pid[1])]);
}

export function fromSerializable(p: [number, number][]): Pid {
  return p as Pid;
}

export function toJson(p: Pid): string {
  return JSON.stringify(p);
}

export function show(pid: Pid): string {
  return toJson(pid);
}

function randomBetween(left: number, right: number): number {
  const delta: number = Math.floor(Math.random() * Number(right - left));
  return left + 1 + delta;
}

export function eq(left: Pid, right: Pid): boolean {
  if (left.length !== right.length) {
    return false;
  } else {
    for (let i = 0; i < left.length; i++) {
      if (left[i][0] !== right[i][0] || left[i][1] !== right[i][1]) {
        return false;
      }
    }
    return true;
  }
}

export function lt(left: Pid, right: Pid): boolean {
  for (let i = 0; i < left.length; i++) {
    if (right.length <= i) {
      return false;
    } else if (left[i][0] < right[i][0]) {
      return true;
    } else if (left[i][0] > right[i][0]) {
      return false;
    }
  }

  return false;
}

export function gt(left: Pid, right: Pid): boolean {
  return !eq(left, right) && !lt(left, right);
}

// Generate a PID p between left and right, such that left < p < right.
export function generate(clientId: number, left: Pid, right: Pid): Pid {
  if (eq(left, right)) {
    throw new PidOrderingError(`Left and right PIDs are equal: ${show(left)}`);
  } else if (gt(left, right)) {
    throw new PidOrderingError(`Left PID is greater than right PID: ${show(left)} > ${show(right)}`);
  }

  const p = [];
  for (let i = 0; i < left.length; i++) {
    let decRight;
    if (right.length > i) {
      const d: number = right[i][0] - 1;
      decRight = [d, right[i][1]];
    } else {
      decRight = [MAX_PID, clientId];
    }
    if (left[i] < decRight) {
      const r = randomBetween(left[i][0] + 1, right[i][0]);
      p.push([r, clientId]);
      return p as Pid;
    } else if (left[i] > right[i]) {
      throw new PidOrderingError('Left PID is greater than right PID');
    } else {
      p.push(left[i]);
    }
  }

  const lastLeft = left[left.length - 1];
  const lastRight = right[right.length - 1];

  if (lastRight[0] === 0 && lastRight[1] === clientId) {
    throw new PidOrderingError('Adjacent PIDs');
  }

  p.push([randomBetween(0, MAX_PID), clientId]);

  return p as Pid;
}

export function uids(pid: Pid): number[] {
  return pid.map((pid) => pid[0]);
}