export type Pid = [number, number][] & { readonly __tag: unique symbol };

// Chosen by comparison with instant.nvim. Can be adjusted; this is just the PID chosen for the document end marker.
export const MAX_PID: number = 10000000000;

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
  }

  for (let i = 0; i < left.length; i++) {
    const l = left[i];
    const r = right[i];

    if (!r || !pidElemEq(l, r)) {
      return false;
    }
  }

  return true;
}

function pidElemLt(left: [number, number], right: [number, number]): boolean {
  return left[0] < right[0] || (left[0] === right[0] && left[1] < right[1]);
}

function pidElemEq(left: [number, number], right: [number, number]): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

export function lt(left: Pid, right: Pid): boolean {
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i];
    const r = right[i];

    if (!r) {
      return false;
    } else if (!l) {
      return true;
    } else if (pidElemLt(l, r)) {
      return true;
    } else if (pidElemEq(l, r)) {
      continue;
    } else {
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
    throw new PidOrderingError(`(1) Left and right PIDs are equal: ${show(left)}`);
  } else if (lt(right, left)) {
    throw new PidOrderingError(`(2) Left PID is greater than right PID: ${show(left)} > ${show(right)}`);
  }

  for (let i = 0; i < left.length; i++) {
    const l = left[i];
    const r = right[i];

    if (!r) {
      const maxPid = make(MAX_PID, 0);
      const subPid = generate(clientId, left.slice(i, -1) as Pid, maxPid);
      const p = [...left.slice(0, i), ...subPid] as Pid;
    } else if (pidElemLt(r, l)) {
      throw new PidOrderingError(`(3) Left PID is greater than right PID: ${show(left)} > ${show(right)}`);
    } else if (pidElemEq(l, r)) {
      continue;
    } else {
      const uid = randomBetween(l[0], r[0]);
      const newElem = [uid, clientId] as [number, number];
      const newPid = [...left.slice(0, i), newElem] as Pid;
      if (lt(left, newPid) && lt(newPid, right)) {
        return newPid;
      } else {
        continue;
      }
    }
  }

  const uid = randomBetween(1, MAX_PID);
  const newElem = [uid, clientId];
  const p = [...left, newElem] as Pid;
  if (lt(left, p) && lt(p, right)) {
    return p;
  } else {
    throw new PidOrderingError(`(4) Left PID is greater than right PID: ${show(left)} > ${show(right)}`);
  }
}

export function uids(pid: Pid): number[] {
  return pid.map((pid) => pid[0]);
}