// Logoot helper functions

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
      const r = randomBetween(left[i][0] + 1n, right[i][0])
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