// Logoot helper functions

import { pid } from "process";

export type ClientId = bigint & { readonly __tag: unique symbol };
export type Pid = [bigint, ClientId][] & { readonly __tag: unique symbol };

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

// Generate a PID p between left and right, such that left < p < right.
export function generatePid(clientId: ClientId, left: Pid, right: Pid): Pid {
  const p = [];
  for (let i = 0; i < left.length; i++) {
    const decRight = [right[i][0] - 1n, right[i][1]];
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

  p.push([randomBetween(0n, MAX_PID), clientId]);

  return p as Pid;
}

type InitialCRDT = {
  hostId: ClientId,
  uids: bigint[],
  lines: string[],
};

export class CRDT {
  pidMap: Map<string, string> = new Map();

  initialize(initial: InitialCRDT) {
    const joinedLines = initial.lines.join("\n") + '\n';

    for (let i = 0; i < joinedLines.length; i++) {
      const pidUid: bigint = initial.uids[i];
      const char: string = joinedLines[i];
      const pid: Pid = [[pidUid, initial.hostId]] as Pid;
      this.pidMap.set(JSON.stringify(pid), char);
    }
  }

  insert(pid: Pid, char: string): void {
    this.pidMap.set(JSON.stringify(pid), char);
  }

  delete(pid: Pid): void {
    this.pidMap.delete(JSON.stringify(pid));
  }

  asString(): string {
    const sortedPids = [...this.pidMap.keys()].sort((a, b) => {
      const pidA: Pid = JSON.parse(a);
      const pidB: Pid = JSON.parse(b);

      if (pidA < pidB) {
        return -1;
      } else if (pidA > pidB) {
        return 1;
      }

      return 0;
    });

    return sortedPids.map((pid) => this.pidMap.get(pid)).join('');
  }
}