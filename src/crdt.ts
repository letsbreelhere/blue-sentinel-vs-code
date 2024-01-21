// Logoot helper functions

import Logger from "./logger";
import * as pid from "./pid";
import { Pid } from "./pid";

// Returns the first index for which the element is greater than the given value
// Assumes that xs is sorted
export function sortedIndex(x: Pid, xs: Pid[]): number {
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

  constructor(initial: { hostId: number, pids: Pid[], lines: string[], }) {
    const joinedLines: string = initial.lines.join("\n");
    let pids = initial.pids;

    this.lowPid = pids[1];
    this.highPid = pids[pids.length - 1];

    pids = pids.slice(2, -1);

    for (let i = 0; i < joinedLines.length; i++) {
      const p: Pid = pids[i];
      const char: string = joinedLines[i];
      if (!pid) {
        console.log(`Invalid PID at index ${i}`);
      }
      this.pidMap.set(pid.toJson(p), char);
      this.sortedPids.push(p);
    }

    console.warn(JSON.stringify({ l: this.lowPid, h: this.highPid}));
    console.warn(JSON.stringify(this.sortedPids));
  }

  allPids(): Pid[] {
    return [this.lowPid, ...this.sortedPids, this.highPid];
  }

  pidAt(i: number): Pid {
    return this.sortedPids[i] as Pid;
  }

  pidForInsert(clientId: number, offset: number): Pid {
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