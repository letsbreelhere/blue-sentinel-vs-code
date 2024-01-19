// Logoot helper functions

import Logger from "./logger";
import * as pid from "./pid";
import { Pid, ClientId } from "./pid";

// Returns the first index for which the element is greater than the given value
// Assumes that xs is sorted
export function sortedIndex<T>(x: T, xs: T[]): number {
  // if (x < xs[0]) {
  //   throw new Error(`Value ${x} is less than the first element of the array ${xs}`);
  // } else if (xs[xs.length - 1] < x) {
  //   throw new Error(`Value ${x} is greater than the last element of the array ${xs}`);
  // }

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

  return right;
}

export class CRDT {
  sortedPids: Pid[] = []; // TODO: Using an array here makes insert/delete painful for large files.
  pidMap: Map<string, string> = new Map();

  initialize(initial: { hostId: ClientId, uids: bigint[], lines: string[], }) {
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

    this.sortedPids.push([[initial.uids[0], initial.hostId]] as Pid); // Represents the beginning of the document
    this.sortedPids.push([[initial.uids[1], initial.hostId]] as Pid); // Represents the beginning of the _first line_
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
    this.sortedPids.push([[initial.uids[initial.uids.length - 1], initial.hostId]] as Pid); // Represents the end of the document
  }

  pidAt(i: number): Pid {
    return this.sortedPids[i] as Pid;
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

  asString(strict: boolean = false): string {
    if (strict) {
      let missingPids: Pid[] = [];
      const str = this.sortedPids.map((p) => {
        const c = this.pidMap.get(pid.toJson(p));
        if (!c) {
          missingPids.push(p);
        }
        return c;
      });

      if (missingPids.length > 3) {
        throw new Error(`Missing ${missingPids.length} PIDs: ${missingPids.map((p) => pid.show(p)).join(", ")}`);
      }

      return str.join('');
    } else {
      return this.sortedPids.map((p) => this.pidMap.get(pid.toJson(p))).join('');
    }
  }
}