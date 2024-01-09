import * as assert from 'assert';

import * as logoot from '../logoot';

suite('Logoot helpers test suite', () => {
  const cid: logoot.ClientId = 1n as logoot.ClientId;
  const cid2: logoot.ClientId = 2n as logoot.ClientId;

	test('PIDs are generated preserving order', () => {
    const left: logoot.Pid = [[1n, cid], [2n, cid], [3n, cid]] as logoot.Pid;
    const right: logoot.Pid = [[1n, cid], [2n, cid2], [4n, cid]] as logoot.Pid;
    const p = logoot.generatePid(cid, left, right);
    const p2 = logoot.generatePid(cid, left, p);

    assert.ok (left < p);
    assert.ok (p < p2);
    assert.ok (p2 < right);
	});

  test('Bad ordering throws an error', () => {
    const left: logoot.Pid = [[1n, cid], [2n, cid], [4n, cid]] as logoot.Pid;
    const right: logoot.Pid = [[1n, cid], [2n, cid], [3n, cid]] as logoot.Pid;

    assert.throws(() => logoot.generatePid(cid, left, right), logoot.PidOrderingError);
  });
});
