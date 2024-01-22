import * as pid from '../pid';
import { Pid, PidOrderingError } from '../pid';
import * as assert from 'assert';

suite('PIDs', () => {
  const cid: number = 1;
  const cid2: number = 2;

  test('PIDs are generated preserving order', () => {
    const left: Pid = [[1, cid], [2, cid], [3, cid]] as Pid;
    const right: Pid = [[1, cid], [2, cid2], [4, cid]] as Pid;

    const p = pid.generate(cid, left, right);
    const p2 = pid.generate(cid, p, right);

    assert.ok(pid.lt(left, p));
    assert.ok(pid.lt(p, p2));
    assert.ok(pid.lt(p2, right));
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