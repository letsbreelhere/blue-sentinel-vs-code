import * as assert from 'assert';
import * as logoot from '../logoot';
import { Pid } from '../logoot';

suite('Logoot helpers test suite', () => {
  const cid: logoot.ClientId = 1n as logoot.ClientId;
  const cid2: logoot.ClientId = 2n as logoot.ClientId;

  test('PID stringification', () => {
    const p = [[1n, cid], [2n, cid], [3n, cid]] as logoot.Pid;

    assert.strictEqual(logoot.pidToJson(p), `[["1","${cid}"],["2","${cid}"],["3","${cid}"]]`);
    assert.ok(logoot.pidsEqual(p, logoot.pidFromJson(logoot.pidToJson(p))));
  });

	test('PIDs are generated preserving order', () => {
    const left: logoot.Pid = [[1n, cid], [2n, cid], [3n, cid]] as logoot.Pid;
    const right: logoot.Pid = [[1n, cid], [2n, cid2], [4n, cid]] as logoot.Pid;

    // Due to randomness, we'll test a few times
    for (let i = 0; i < 10; i++) {
      const p = logoot.generatePid(cid, left, right);
      const p2 = logoot.generatePid(cid, p, right);

      assert.ok (left < p);
      assert.ok (p < p2);
      assert.ok (p2 < right);
    }
	});

  test('Attempting to generate a pid between adjacent pids throws an error', () => {
    const left: logoot.Pid = [[1n, cid], [2n, cid]] as logoot.Pid;
    const right: logoot.Pid = [[1n, cid], [2n, cid], [0n, cid]] as logoot.Pid;

    assert.throws(() => logoot.generatePid(cid, left, right), logoot.PidOrderingError);
  });

  test('Bad ordering throws an error', () => {
    const left: logoot.Pid = [[1n, cid], [2n, cid], [4n, cid]] as logoot.Pid;
    const right: logoot.Pid = [[1n, cid], [2n, cid], [3n, cid]] as logoot.Pid;

    assert.throws(() => logoot.generatePid(cid, left, right), logoot.PidOrderingError);
  });

  test('Bad ordering throws an error - equal PIDs', () => {
    const left: logoot.Pid = [[1n, cid], [2n, cid], [3n, cid]] as logoot.Pid;
    const right: logoot.Pid = [[1n, cid], [2n, cid], [3n, cid]] as logoot.Pid;

    assert.throws(() => logoot.generatePid(cid, left, right), logoot.PidOrderingError);
  });

  suite('Logoot CRDT test suite', () => {
    const hostCid: logoot.ClientId = 0n as logoot.ClientId;
    const cid: logoot.ClientId = 1n as logoot.ClientId;

    const setupCrdt = (): logoot.CRDT => {
      const crdt = new logoot.CRDT();
      const lines = ['hello', 'from', 'instant!'];
      const joinedLines = lines.join("\n") + '\n';
      const uids = joinedLines.split('').map((_, i) => BigInt(i*10 + 1));
      crdt.initialize({
        hostId: hostCid,
        uids: [0n, ...uids, logoot.MAX_PID],
        lines,
      });

      return crdt;
    };

    test('Initialize CRDT', () => {
      const crdt = setupCrdt();
      assert.strictEqual(crdt.asString(), 'hello\nfrom\ninstant!\n');
    });

    test('Inserting a character', () => {
      const crdt = setupCrdt();
      const pid = logoot.generatePid(cid, [[40n, hostCid]] as Pid, [[50n, hostCid]] as Pid);

      crdt.insert(pid, 'X');

      assert.strictEqual(crdt.asString(), 'helloX\nfrom\ninstant!\n');
    });

    test('Deleting a character', () => {
      const crdt = setupCrdt();
      crdt.delete([[50n, hostCid]] as Pid);

      assert.strictEqual(crdt.asString(), 'hell\nfrom\ninstant!\n');
    });
  });
});