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

export function toJson(pids: Pid): string {
  // JSON doesn't support bigint, so we have to convert to string.
  return JSON.stringify(pids.map((pid) => [pid[0].toString(), pid[1].toString()]));
}

export function fromJson(json: string): Pid {
  try {
    const pid = JSON.parse(json) as [string, string][];
    return pid.map((pid) => [BigInt(pid[0]), BigInt(pid[1]) as ClientId]) as Pid;
  } catch (e) {
    throw new Error(`Invalid JSON: ${json}`);
  }
}

export function show(pid: Pid): string {
  return toJson(pid);
}

function randomBetween(left: bigint, right: bigint): bigint {
  const delta: number = Math.floor(Math.random() * Number(right - left));
  return left + 1n + BigInt(delta);
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

// Generate a PID p between left and right, such that left < p < right.
export function generate(clientId: ClientId, left: Pid, right: Pid): Pid {
  if (eq(left, right)) {
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