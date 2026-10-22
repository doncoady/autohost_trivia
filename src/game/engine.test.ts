import test from 'node:test';
import assert from 'node:assert/strict';
import { AutohostGameEngine } from './engine.ts';

test('AutohostGameEngine - Team Mode complete journey and progression', () => {
  const engine = new AutohostGameEngine();
  
  // 1. Initial State
  assert.equal(engine.getState().status, 'idle');

  // 2. Start onboarding & register players
  engine.startOnboarding();
  assert.equal(engine.getState().status, 'onboarding');

  const regResult = engine.registerPlayers(['Alex', 'Jordan']);
  assert.equal(regResult.success, true);
  assert.equal(engine.getState().players.length, 2);
  assert.equal(engine.getState().players[0].name, 'Alex');
  assert.equal(engine.getState().players[1].name, 'Jordan');

  // 3. Select mode
  const modeResult = engine.selectMode('team');
  assert.equal(modeResult.success, true);
  assert.equal(engine.getState().status, 'ready');

  // 4. Confirm ready & deal first question
  const startResult = engine.confirmReady();
  assert.equal(startResult.success, true);
  const s1 = engine.getState();
  assert.equal(s1.status, 'active');
  assert.equal(s1.question_index, 1);
  assert.equal(s1.current_question?.value, 25);
  assert.equal(s1.current_question?.difficulty, 'easy');

  // 5. Test Hint without penalty
  const hintRes = engine.requestHint();
  assert.equal(hintRes.success, true);
  assert.equal(engine.getState().current_question?.hint_used, true);

  // 6. Answer Q1 correctly (+$25)
  const a1 = engine.submitAnswer('correct', 'Answer 1');
  assert.equal(a1.points_awarded, 25);
  assert.equal(engine.getState().team_score, 25);
  assert.equal(engine.getState().strike_count, 0);
  assert.equal(engine.getState().question_index, 2);
  assert.equal(engine.getState().current_question?.value, 25);

  // 7. Answer Q2 incorrectly ($0, increments strike_count)
  const a2 = engine.submitAnswer('incorrect', 'Wrong answer');
  assert.equal(a2.points_awarded, 0);
  assert.equal(engine.getState().team_score, 25);
  assert.equal(engine.getState().strike_count, 1);
  assert.equal(engine.getState().question_index, 3);
  assert.equal(engine.getState().current_question?.value, 25);

  // 8. Skip Q3 (awards 0 points, does NOT increment strike_count)
  const skipRes = engine.skipQuestion();
  assert.equal(skipRes.success, true);
  assert.equal(engine.getState().team_score, 25);
  assert.equal(engine.getState().strike_count, 1); // Remains 1, not incremented
  assert.equal(engine.getState().question_index, 4);

  // Q4 should now be medium ($50)
  assert.equal(engine.getState().current_question?.value, 50);

  // Answer Q4 and Q5 correctly (+$50 each -> +$100 -> total 125)
  engine.submitAnswer('correct', 'Ans 4');
  engine.submitAnswer('correct', 'Ans 5');
  assert.equal(engine.getState().team_score, 125);
  assert.equal(engine.getState().question_index, 6);
  assert.equal(engine.getState().current_question?.value, 50);

  // Answer Q6 correctly (+$50 -> total 175)
  engine.submitAnswer('correct', 'Ans 6');
  assert.equal(engine.getState().team_score, 175);
  assert.equal(engine.getState().question_index, 7);

  // Q7 to Q10 should be hard ($100 each)
  assert.equal(engine.getState().current_question?.value, 100);
  engine.submitAnswer('correct', 'Ans 7'); // +$100 -> 275
  engine.submitAnswer('correct', 'Ans 8'); // +$100 -> 375
  engine.submitAnswer('correct', 'Ans 9'); // +$100 -> 475
  assert.equal(engine.getState().question_index, 10);
  assert.equal(engine.getState().current_question?.value, 100);

  // Q10 final question
  const finalAns = engine.submitAnswer('correct', 'Ans 10'); // +$100 -> 575
  assert.equal(finalAns.points_awarded, 100);
  assert.equal(finalAns.game_over, true);
  assert.equal(engine.getState().team_score, 575);
  assert.equal(engine.getState().status, 'finished');
});

test('AutohostGameEngine - PvP Mode turn rotation, fairness, and scoring', () => {
  const engine = new AutohostGameEngine();
  engine.startOnboarding();
  engine.registerPlayers(['Alice', 'Bob', 'Charlie']);
  engine.selectMode('pvp');
  engine.confirmReady();

  // Round 1 ($25): starting player should be Alice (p1)
  assert.equal(engine.getState().round_index, 1);
  assert.equal(engine.getState().active_player_id, 'p1');
  assert.equal(engine.getState().current_question?.value, 25);

  // Alice answers correctly
  engine.submitAnswer('correct', 'Ans Alice');
  assert.equal(engine.getState().players[0].score, 25);

  // Turn rotates to Bob (p2)
  assert.equal(engine.getState().active_player_id, 'p2');
  engine.submitAnswer('incorrect', 'Ans Bob');
  assert.equal(engine.getState().players[1].score, 0);
  assert.equal(engine.getState().players[1].strike_count, 1);

  // Turn rotates to Charlie (p3)
  assert.equal(engine.getState().active_player_id, 'p3');
  engine.submitAnswer('correct', 'Ans Charlie');
  assert.equal(engine.getState().players[2].score, 25);

  // Round 2 ($50): starting player rotates to Bob (p2) for fairness!
  assert.equal(engine.getState().round_index, 2);
  assert.equal(engine.getState().active_player_id, 'p2');
  assert.equal(engine.getState().current_question?.value, 50);

  // Bob answers correctly
  engine.submitAnswer('correct', 'Ans Bob R2');
  assert.equal(engine.getState().players[1].score, 50);

  // Next is Charlie (p3)
  assert.equal(engine.getState().active_player_id, 'p3');
  engine.submitAnswer('correct', 'Ans Charlie R2');
  assert.equal(engine.getState().players[2].score, 75);

  // Next is Alice (p1)
  assert.equal(engine.getState().active_player_id, 'p1');
  engine.submitAnswer('correct', 'Ans Alice R2');
  assert.equal(engine.getState().players[0].score, 75);

  // Round 3 ($100): starting player rotates to Charlie (p3)
  assert.equal(engine.getState().round_index, 3);
  assert.equal(engine.getState().active_player_id, 'p3');
  assert.equal(engine.getState().current_question?.value, 100);

  // Charlie answers correctly (+100 -> 175)
  engine.submitAnswer('correct', 'Ans Charlie R3');
  assert.equal(engine.getState().players[2].score, 175);

  // Next is Alice (p1) (+100 -> 175)
  assert.equal(engine.getState().active_player_id, 'p1');
  engine.submitAnswer('correct', 'Ans Alice R3');
  assert.equal(engine.getState().players[0].score, 175);

  // Next is Bob (p2) (+0 -> 50)
  assert.equal(engine.getState().active_player_id, 'p2');
  engine.submitAnswer('incorrect', 'Ans Bob R3');
  assert.equal(engine.getState().players[1].score, 50);

  // Alice and Charlie are tied at 175 each!
  // This MUST trigger sudden death between Alice and Charlie!
  const statePostR3 = engine.getState();
  assert.equal(statePostR3.is_sudden_death, true);
  assert.equal(statePostR3.status, 'active');
  assert.equal(statePostR3.turn_order.length, 2); // only tied players
  assert.equal(statePostR3.turn_order.includes('p1'), true);
  assert.equal(statePostR3.turn_order.includes('p3'), true);
  assert.equal(statePostR3.current_question?.value, 100);

  // First tied player answers: incorrect (score remains 175)
  const firstTied = statePostR3.active_player_id!;
  engine.submitAnswer('incorrect', 'wrong');

  // Second tied player answers: correct (+100 -> 275)
  const suddenDeathVerdict = engine.submitAnswer('correct', 'correct');
  assert.equal(suddenDeathVerdict.game_over, true);
  assert.equal(engine.getState().status, 'finished');
  assert.ok(engine.getState().winner_name);
});

test('AutohostGameEngine - Pause, Resume, and Restart', () => {
  const engine = new AutohostGameEngine();
  engine.startOnboarding();
  engine.registerPlayers(['Sam']);
  engine.selectMode('team');
  engine.confirmReady();

  assert.equal(engine.getState().status, 'active');
  engine.pauseGame();
  assert.equal(engine.getState().status, 'paused');
  engine.resumeGame();
  assert.equal(engine.getState().status, 'active');

  engine.restartGame();
  const resetState = engine.getState();
  assert.equal(resetState.status, 'ready');
  assert.equal(resetState.players[0].name, 'Sam');
  assert.equal(resetState.team_score, 0);
});
