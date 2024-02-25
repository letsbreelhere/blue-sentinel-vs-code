import * as assert from 'assert';
import { CRDT, sortedIndex } from '../crdt';
import { Pid, PidOrderingError } from '../pid';
import * as pid from '../pid';

suite('CRDT', () => {
  const hostCid: number = 0;
  const cid: number = 1;

  const setupCrdt = (): CRDT => {
    const lines = ['hello', 'from', 'instant!'];
    const joinedLines = lines.join("\n");
    const pids = joinedLines.split('').map((_, i) => {
      return [[(i + 1) * 10 + 1, hostCid]] as Pid;
    });
    return new CRDT({
      hostId: hostCid,
      pids: [pid.make(0, hostCid), pid.make(1, hostCid), ...pids, pid.make(pid.MAX_UID, hostCid)],
      lines,
    });
  };

  test('Initialize CRDT', () => {
    const crdt = setupCrdt();
    assert.strictEqual(crdt.asString(), 'hello\nfrom\ninstant!');
  });

  test('Inserting a character', () => {
    const crdt = setupCrdt();
    const lpid = crdt.pidAt(4)!;
    const rpid = crdt.pidAt(5)!;
    const p = pid.generate(cid, lpid, rpid);

    crdt.insert(p, 'X');

    assert.strictEqual(crdt.asString(), 'helloX\nfrom\ninstant!');
  });

  test('Deleting a character', () => {
    const crdt = setupCrdt();
    crdt.delete(crdt.pidAt(4)!);

    assert.strictEqual(crdt.asString(), 'hell\nfrom\ninstant!');
  });

  test('"Integration" test', () => {
    const hostId = 100 as number;
    const crdt = new CRDT({
      hostId,
      pids: [pid.make(0, hostId), pid.make(7134612581, hostId), pid.make(pid.MAX_UID, hostId)],
      lines: [""],
    });

    // Obtained from a live client by typing "ABC" and then "x" at the beginning of the document
    const inserts: [string, Pid][] = [
      ["A", pid.make(8323330731, 100) as Pid],
      ["B", pid.make(8946858145, 100) as Pid],
      ["C", pid.make(9738148624, 100) as Pid],
      ["x", pid.make(7517973107, 100) as Pid],
    ];

    inserts.forEach(([c, p]) => {
      crdt.insert(p, c);
    });

    assert.equal(crdt.asString(), 'xABC');
    crdt.delete([[7517973107, 100]] as Pid);
    assert.equal(crdt.asString(), 'ABC');
  });
});
