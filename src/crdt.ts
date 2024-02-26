// Logoot helper functions

import Logger from "./logger";
import * as pid from "./pid";
import { Pid } from "./pid";

// Returns the last index for which the element is less than the given value
// Assumes that xs is sorted
export function sortedIndex(x: Pid, xs: Pid[]): number {
  let left = 0;
  let right = xs.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (pid.lt(xs[mid], x)) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  return left;
}

export class CRDT {
  // TODO: Using an array here makes insert/delete painful for large files.
  // This is private to avoid confusion with actual document indices.
  private sortedPids: Pid[] = [];
  private lowPid: Pid;
  private highPid: Pid;

  pidMap: Map<string, string> = new Map();

  constructor(initial: { hostId: number, pids: Pid[], lines: string[], }) {
    const joinedLines: string = initial.lines.join("\n");
    let pids = initial.pids;

    this.lowPid = pids[0];
    this.highPid = pids[pids.length - 1];

    pids = pids.slice(2, -1);

    for (let i = 0; i < joinedLines.length; i++) {
      const p: Pid = pids[i];
      const char: string = joinedLines[i];
      this.pidMap.set(pid.toJson(p), char);
      this.sortedPids.push(p);
    }
  }

  allPids(): Pid[] {
    return [this.lowPid, ...this.sortedPids, this.highPid];
  }

  pidAt(i: number): Pid | undefined {
    return this.sortedPids[i] as Pid;
  }

  pidForInsert(clientId: number, index: number): Pid {
    let left: Pid, right: Pid;

    if (index === 0) {
      left = this.lowPid;
      right = this.pidAt(0) || this.highPid;
    } else if (index >= this.sortedPids.length) {
      left = this.pidAt(this.sortedPids.length - 1)!;
      right = this.highPid;
    } else {
      left = this.pidAt(index - 1)!;
      right = this.pidAt(index)!;
    }

    return pid.generate(clientId, left, right);
  }

  pidAfter(i: number): Pid {
    return this.pidAt(i + 1) || this.highPid;
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
    return this.sortedPids.map((p) => this.charAt(p)).join('');
  }
}
