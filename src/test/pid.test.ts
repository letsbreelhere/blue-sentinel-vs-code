import * as pid from '../pid';
import { Pid, PidOrderingError } from '../pid';
import * as assert from 'assert';

suite('PIDs', () => {
  const cid: number = 1;
  const cid2: number = 2;

  test('PID comparison', () => {
    assert.equal(pid.compare([[1,0]] as Pid, [[2,0]] as Pid), "LT");
    assert.equal(pid.compare([[1,0],[2,0]] as Pid, [[1,0],[2,0],[3,0]] as Pid), "LT");
    assert.equal(pid.compare([[5,0]] as Pid, [[2,0]] as Pid), "GT");
    assert.equal(pid.compare([[2,0],[1,0]] as Pid, [[2,0]] as Pid), "GT");
  });

  test('PIDs are generated preserving order', () => {
    const left: Pid = [[1, cid], [2, cid], [3, cid]] as Pid;
    const right: Pid = [[1, cid], [2, cid2], [4, cid]] as Pid;

    const p = pid.generate(cid, left, right);
    const p2 = pid.generate(cid, p, right);

    assert.ok(pid.lt(left, p));
    assert.ok(pid.lt(p, p2));
    assert.ok(pid.lt(p2, right));
  });

  test('Lots of PIDs at once', () => {
    const low: Pid = pid.make(1, cid);
    const high: Pid = pid.make(pid.MAX_PID, cid);

    let cur = low;
    for (let i = 0; i < 1000; i++) {
      const p = pid.generate(cid, cur, high);
      assert.ok(pid.lt(cur, p), `cur: ${pid.show(cur)}, p: ${pid.show(p)}`);
      assert.ok(pid.lt(p, high), `p: ${pid.show(p)}, high: ${pid.show(high)}`);
      cur = p;
    }
  });

  test('Attempting to generate a pid between adjacent pids throws an error', () => {
    const left: Pid = [[1, cid], [2, cid]] as Pid;
    const right: Pid = [[1, cid], [2, cid], [0, cid]] as Pid;

    assert.throws(() => pid.generate(cid, left, right), PidOrderingError);
  });

  test('Bad ordering throws an error', () => {
    const left: Pid = [[1, cid], [2, cid], [4, cid]] as Pid;
    const right: Pid = [[1, cid], [2, cid], [3, cid]] as Pid;

    assert.throws(() => pid.generate(cid, left, right), PidOrderingError);
  });

  test('Bad ordering throws an error - equal PIDs', () => {
    const left: Pid = [[1, cid], [2, cid], [3, cid]] as Pid;
    const right: Pid = [[1, cid], [2, cid], [3, cid]] as Pid;

    assert.throws(() => pid.generate(cid, left, right), PidOrderingError);
  });
});
