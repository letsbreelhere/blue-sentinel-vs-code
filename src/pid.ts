import { ThemeIcon } from "vscode";

export type Pid = [number, number][] & { readonly __tag: unique symbol };

// Chosen by comparison with instant.nvim. Can be adjusted; this is just the PID chosen for the document end marker.
export const MAX_UID: number = 2**32 - 1;

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

function pidElemLt(left: [number, number], right: [number, number]): boolean {
  return left[0] < right[0] || (left[0] === right[0] && left[1] < right[1]);
}

function pidElemEq(left: [number, number], right: [number, number]): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

type Ordering = "LT" | "EQ" | "GT";
export function compare(left: Pid, right: Pid): Ordering {
  const len = Math.min(left.length, right.length);

  for (let i = 0; i < len; i++) {
    const l = left[i];
    const r = right[i];

    if (pidElemLt(l, r)) {
      return "LT";
    } else if (pidElemLt(r, l)) {
      return "GT";
    }
  }

  if (left.length < right.length) {
    return "LT";
  } else if (left.length > right.length) {
    return "GT";
  } else {
    return "EQ";
  }
}

export function eq(left: Pid, right: Pid): boolean {
  return compare(left, right) === "EQ";
}

export function lt(left: Pid, right: Pid): boolean {
  return compare(left, right) === "LT";
}

export function gt(left: Pid, right: Pid): boolean {
  return compare(left, right) === "GT";
}

// Generate a PID p between left and right, such that left < p < right.
export function generate(clientId: number, left: Pid, right: Pid): Pid {
  if (eq(left, right)) {
    throw new PidOrderingError(`(1) Left and right PIDs are equal: ${show(left)}`);
  }

  const maxlen = Math.max(left.length, right.length);
  let differingIndex = maxlen;

  for (let i = 0; i < maxlen; i++) {
    const l = left[i] || [0, clientId];
    const r = right[i] || [MAX_UID, clientId];

    if (pidElemLt(r, l)) {
      throw new PidOrderingError(`(3) Left PID is greater than right PID: ${l} > ${r}`);
    } else if (pidElemEq(l, r)) {
      continue;
    } else {
      if (r[0] - l[0] > 1) {
        differingIndex = i;
        break;
      }
    }
  }

  const luid = left[differingIndex] ? left[differingIndex][0] : 0;
  const ruid = right[differingIndex] ? right[differingIndex][0] : MAX_UID;
  const uid = Math.floor((luid+ruid) / 2);
  const pidPrefix = left.slice(0, differingIndex);
  const generated = [...pidPrefix, [uid, clientId]] as Pid;
  if (lt(left, generated) && lt(generated, right)) {
    return generated;
  } else {
    throw new PidOrderingError(`Generated PID ${show(generated)} is not between ${show(left)} and ${show(right)}`);
  }
}

export function uids(pid: Pid): number[] {
  return pid.map((pid) => pid[0]);
}
