import * as assert from 'assert';
import { CRDT, sortedIndex } from '../crdt';
import { Pid, ClientId, PidOrderingError } from '../pid';
import * as pid from '../pid';

suite('Logoot helpers test suite', () => {
  const cid: ClientId = 1n as ClientId;
  const cid2: ClientId = 2n as ClientId;

  test('PID stringification', () => {
    const p = [[1n, cid], [2n, cid], [3n, cid]] as Pid;

    assert.strictEqual(pid.toJson(p), `[["1","${cid}"],["2","${cid}"],["3","${cid}"]]`);
    assert.ok(pid.eq(p, pid.fromJson(pid.toJson(p))));
  });

	test('PIDs are generated preserving order', () => {
    const left: Pid = [[1n, cid], [2n, cid], [3n, cid]] as Pid;
    const right: Pid = [[1n, cid], [2n, cid2], [4n, cid]] as Pid;

    // Due to randomness, we'll test a few times
    for (let i = 0; i < 10; i++) {
      const p = pid.generate(cid, left, right);
      const p2 = pid.generate(cid, p, right);

      assert.ok (left < p);
      assert.ok (p < p2);
      assert.ok (p2 < right);
    }
	});

  test('Attempting to generate a pid between adjacent pids throws an error', () => {
    const left: Pid = [[1n, cid], [2n, cid]] as Pid;
    const right: Pid = [[1n, cid], [2n, cid], [0n, cid]] as Pid;

    assert.throws(() => pid.generate(cid, left, right), PidOrderingError);
  });

  test('Bad ordering throws an error', () => {
    const left: Pid = [[1n, cid], [2n, cid], [4n, cid]] as Pid;
    const right: Pid = [[1n, cid], [2n, cid], [3n, cid]] as Pid;

    assert.throws(() => pid.generate(cid, left, right), PidOrderingError);
  });

  test('Bad ordering throws an error - equal PIDs', () => {
    const left: Pid = [[1n, cid], [2n, cid], [3n, cid]] as Pid;
    const right: Pid = [[1n, cid], [2n, cid], [3n, cid]] as Pid;

    assert.throws(() => pid.generate(cid, left, right), PidOrderingError);
  });

  suite('Logoot CRDT test suite', () => {
    test('sortedIndex returns the first index for which the element is greater than the given value', () => {
      const xs = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];

      assert.strictEqual(sortedIndex(5, xs), 1, '5');
      assert.strictEqual(sortedIndex(15, xs), 2, '15');
      assert.strictEqual(sortedIndex(25, xs), 3, '25');
    });

    const hostCid: ClientId = 0n as ClientId;
    const cid: ClientId = 1n as ClientId;

    const setupCrdt = (): CRDT => {
      const crdt = new CRDT();
      const lines = ['hello', 'from', 'instant!'];
      const joinedLines = lines.join("\n");
      const uids = joinedLines.split('').map((_, i) => BigInt((i+1)*10 + 1));
      crdt.initialize({
        hostId: hostCid,
        uids: [0n, 1n, ...uids, pid.MAX_PID],
        lines,
      });

      return crdt;
    };

    test('Initialize CRDT', () => {
      const crdt = setupCrdt();
      assert.strictEqual(crdt.asString(), 'hello\nfrom\ninstant!');
    });

    test('Inserting a character', () => {
      const crdt = setupCrdt();
      const lpid = crdt.sortedPids[6];
      const rpid = crdt.sortedPids[7];
      const p = pid.generate(cid, lpid, rpid);

      crdt.insert(p, 'X');

      assert.strictEqual(crdt.asString(), 'helloX\nfrom\ninstant!');
    });

    test('Deleting a character', () => {
      const crdt = setupCrdt();
      crdt.delete(crdt.sortedPids[6]);

      assert.strictEqual(crdt.asString(), 'hell\nfrom\ninstant!');
    });

    test('"Integration" test', () => {
      const crdt = new CRDT();

      crdt.initialize({
        hostId: 100n as ClientId,
        uids: [0n, 7134612581n, 10000000000n],
        lines: [""],
      });

      // Obtained from a live client by typing "ABC" and then "x" between "A" and "B".
      const inserts: [string, Pid][] = [
        ["A", [[8323330731n, 100n]] as Pid],
        ["B", [[8946858145n, 100n]] as Pid],
        ["C", [[9738148624n, 100n]] as Pid],
        ["x", [[7517973107n, 100n]] as Pid],
      ];

      inserts.forEach(([c, p]) => {
        crdt.insert(p, c);
      });

      assert.equal(crdt.asString(), 'xABC');
      crdt.delete([[7517973107n, 100n]] as Pid);
      assert.equal(crdt.asString(), 'ABC');
    });
  });
});