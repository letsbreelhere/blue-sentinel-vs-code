// Logoot helper functions

import { pid } from "process";
import Logger from "./logger";
import assert from "assert";

export type ClientId = bigint & { readonly __tag: unique symbol };
export type Pid = [bigint, ClientId][] & { readonly __tag: unique symbol };

export function pidToJson(pids: Pid): string {
  // JSON doesn't support bigint, so we have to convert to string.
  return JSON.stringify(pids.map((pid) => [pid[0].toString(), pid[1].toString()]));
}

export function pidFromJson(json: string): Pid {
  try {
    const pid = JSON.parse(json) as [string, string][];
    return pid.map((pid) => [BigInt(pid[0]), BigInt(pid[1]) as ClientId]) as Pid;
  } catch (e) {
    throw new Error(`Invalid JSON: ${json}`);
  }
}

// Chosen by comparison with instant.nvim. Can be adjusted; this is just the PID chosen for the document end marker.
export const MAX_PID: bigint = 10000000000n;

export class PidOrderingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PidOrderingError';
  }
}

export function randomBetween(left: bigint, right: bigint): bigint {
  const delta: number = Math.floor(Math.random() * Number(right - left));
  return left + 1n + BigInt(delta);
}

export function pidsEqual(left: Pid, right: Pid): boolean {
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

// Generate a PID p between left and right, such that left < p < right.
export function generatePid(clientId: ClientId, left: Pid, right: Pid): Pid {
  if (pidsEqual(left, right)) {
    throw new PidOrderingError('Left PID is equal to right PID');
  } else if (left > right) {
    throw new PidOrderingError('Left PID is greater than right PID');
  }

  const p = [];
  for (let i = 0; i < left.length; i++) {
    let decRight;
    if (right.length > i) {
      decRight = [right[i][0] - 1n, right[i][1]];
    } else {
      decRight = [MAX_PID, clientId];
    }
    if (left[i] < decRight) {
      const r = randomBetween(left[i][0] + 1n, right[i][0]);
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

  if (lastRight[0] === 0n && lastRight[1] === clientId) {
    throw new PidOrderingError('Adjacent PIDs');
  }

  p.push([randomBetween(0n, MAX_PID), clientId]);

  return p as Pid;
}

export function sortedIndex<T>(x: T, xs: T[]): number {
  // return xs.findIndex((y) => y > x);

  let left = 0;
  let right = xs.length - 1;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (xs[mid] === pid) {
      return mid;
    } else if (xs[mid] < x) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  if (xs[right] < x) {
    return -1;
  } else {
    return right;
  }
}

export class CRDT {
  sortedPids: Pid[] = []; // TODO: Using an array here makes insert/delete painful for large files.
  pidMap: Map<string, string> = new Map();

  initialize(initial: { hostId: ClientId, uids: bigint[], lines: string[], }) {
    const joinedLines: string = initial.lines.join("\n") + '\n';

    if (initial.uids.length !== joinedLines.length + 2) {
      let err = [
        `Invalid initial content: ${initial.lines}`,
        `UID count: ${initial.uids.length}`,
        `Content length: ${joinedLines.length}`,
      ];
      throw new Error(err.join("\n"));
    }

    const uids = initial.uids.slice(1, -1);

    this.sortedPids.push([[initial.uids[0], initial.hostId]] as Pid);
    for (let i = 0; i < joinedLines.length; i++) {
      const uid: bigint = uids[i];
      const char: string = joinedLines[i];
      const pid: Pid = [[uid, initial.hostId]] as Pid;
      if (!uid) {
        console.log(`Invalid UID: ${uid}`);
      }
      this.pidMap.set(pidToJson(pid), char);
      this.sortedPids.push(pid);
    }
    this.sortedPids.push([[initial.uids[initial.uids.length - 1], initial.hostId]] as Pid);
  }

  insert(pid: Pid, char: string): number {
    this.pidMap.set(pidToJson(pid), char);
    const i = sortedIndex(pid, this.sortedPids);
    this.sortedPids = [...this.sortedPids.slice(0, i), pid, ...this.sortedPids.slice(i)];
    Logger.log(`document: ${this.asString()}`);
    return i;
  }

  delete(pid: Pid): number {
    this.pidMap.delete(pidToJson(pid));
    const i = sortedIndex(pid, this.sortedPids);
    this.sortedPids = [...this.sortedPids.slice(0, i), ...this.sortedPids.slice(i)];
    return i;
  }

  asString(): string {
    return this.sortedPids.slice(1,-1).map((pid) => this.pidMap.get(pidToJson(pid))).join('');
  }
}