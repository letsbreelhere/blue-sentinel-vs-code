// Logoot helper functions

import Logger from "./logger";
import * as pid from "./pid";
import { Pid, ClientId } from "./pid";

// Returns the first index for which the element is greater than the given value
// Assumes that xs is sorted
export function sortedIndex(x: Pid, xs: Pid[]): number {
  const i = xs.findIndex((y) => pid.lt(x, y));
  if (i === -1) {
    return xs.length;
  }

  // We can worry about this later
  let left = 0;
  let right = xs.length - 1;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (pid.eq(xs[mid], x)) {
      return mid;
    } else if (pid.lt(xs[mid], x)) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return right;
}

export class CRDT {
  // TODO: Using an array here makes insert/delete painful for large files.
  // This is private to avoid confusion with actual document indices.
  private sortedPids: Pid[] = [];
  private lowPid: Pid;
  private highPid: Pid;

  pidMap: Map<string, string> = new Map();

  constructor(initial: { hostId: ClientId, uids: bigint[], lines: string[], }) {
    const joinedLines: string = initial.lines.join("\n");

    if (initial.uids.length !== joinedLines.length + 3) {
      let err = [
        `Invalid initial content: ${initial.lines}`,
        `UID count: ${initial.uids.length}`,
        `Content length: ${joinedLines.length}`,
      ];
      throw new Error(err.join("\n"));
    }

    const uids = initial.uids.slice(2, -1);

    this.lowPid = [[initial.uids[1], initial.hostId]] as Pid; // Represents the beginning of the document

    for (let i = 0; i < joinedLines.length; i++) {
      const uid: bigint = uids[i];
      const char: string = joinedLines[i];
      const p: Pid = [[uid, initial.hostId]] as Pid;
      if (!uid) {
        console.log(`Invalid UID: ${uid}`);
      }
      this.pidMap.set(pid.toJson(p), char);
      this.sortedPids.push(p);
    }

    this.highPid = [[initial.uids[initial.uids.length - 1], initial.hostId]] as Pid; // Represents the beginning of the _first line_
  }

  pidAt(i: number): Pid {
    return this.sortedPids[i] as Pid;
  }

  pidForInsert(clientId: ClientId, offset: number): Pid {
    if (offset === 0) {
      return pid.generate(clientId, this.lowPid, this.pidAt(0) || this.highPid);
    } else if (offset === this.sortedPids.length) {
      return pid.generate(clientId, this.pidAt(this.sortedPids.length - 1) || this.lowPid, this.highPid);
    } else {
      return pid.generate(clientId, this.pidAt(offset - 1), this.pidAt(offset));
    }
  }

  pidAfter(i: number): Pid {
    return this.pidAt(i + 1) || this.highPid;
  }

  eofPid(): Pid {
    return this.highPid;
  }

  insert(p: Pid, char: string): number {
    this.pidMap.set(pid.toJson(p), char);
    const i = sortedIndex(p, this.sortedPids);
    this.sortedPids = [...this.sortedPids.slice(0, i), p, ...this.sortedPids.slice(i)];
    return i;
  }

  delete(p: Pid): number {
    this.pidMap.delete(pid.toJson(p));
    const i = sortedIndex(p, this.sortedPids);
    this.sortedPids = [...this.sortedPids.slice(0, i), ...this.sortedPids.slice(i+1)];
    return i;
  }

  charAt(p: Pid): string | undefined {
    return this.pidMap.get(pid.toJson(p));
  }

  asString(): string {
    return this.sortedPids.map((p) => this.pidMap.get(pid.toJson(p))).join('');
  }
}