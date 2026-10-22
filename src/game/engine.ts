import { Question, VALID_QUESTION_BANK } from './questions.ts';

export type GameMode = 'team' | 'pvp';
export type GameStatus = 'idle' | 'onboarding' | 'ready' | 'active' | 'paused' | 'finished';

export interface Player {
  id: string;
  name: string;
  score: number;
  strike_count: number;
}

export interface CurrentQuestionState {
  id: string;
  text: string;
  value: 25 | 50 | 100;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  answer_key: string;
  accepted_answers: string[];
  explanation: string;
  hint: string;
  hint_used: boolean;
  answered: boolean;
}

export interface AuthoritativeGameState {
  mode: GameMode;
  status: GameStatus;
  players: Player[];
  team_score: number;
  strike_count: number;
  question_index: number;
  round_index: number;
  active_player_id: string | null;
  current_question: CurrentQuestionState | null;
  is_sudden_death: boolean;
  winner_id: string | null;
  winner_name: string | null;
  used_question_ids: string[];
  turn_order: string[]; // Order of player IDs for the current round
  turn_index: number; // Current index within the round's turn order
}

export interface AnswerVerdictResult {
  accepted: boolean;
  verdict: 'correct' | 'incorrect' | 'clarification_needed';
  points_awarded: number;
  previous_score: number;
  new_score: number;
  correct_answer: string;
  explanation: string;
  game_over: boolean;
  winner_name?: string | null;
  is_sudden_death?: boolean;
}

export class AutohostGameEngine {
  private state: AuthoritativeGameState;
  private questionPool: Question[];

  constructor(customQuestions?: Question[]) {
    this.questionPool = customQuestions && customQuestions.length > 0 
      ? [...customQuestions] 
      : [...VALID_QUESTION_BANK];
    
    this.state = this.getInitialState();
  }

  private getInitialState(): AuthoritativeGameState {
    return {
      mode: 'team',
      status: 'idle',
      players: [],
      team_score: 0,
      strike_count: 0,
      question_index: 0,
      round_index: 1,
      active_player_id: null,
      current_question: null,
      is_sudden_death: false,
      winner_id: null,
      winner_name: null,
      used_question_ids: [],
      turn_order: [],
      turn_index: 0,
    };
  }

  public getState(): AuthoritativeGameState {
    return {
      ...this.state,
      players: this.state.players.map(p => ({ ...p })),
      current_question: this.state.current_question ? { ...this.state.current_question } : null,
      used_question_ids: [...this.state.used_question_ids],
      turn_order: [...this.state.turn_order],
    };
  }

  /**
   * Starts onboarding flow
   */
  public startOnboarding(): AuthoritativeGameState {
    this.state.status = 'onboarding';
    return this.getState();
  }

  /**
   * Registers player names (at least 1 for team, 2-4 for PvP)
   */
  public registerPlayers(names: string[]): { success: boolean; message: string; state: AuthoritativeGameState } {
    const cleaned = names.map(n => n.trim()).filter(n => n.length > 0);
    if (cleaned.length === 0) {
      return { success: false, message: 'Please provide at least one player name.', state: this.getState() };
    }

    this.state.players = cleaned.map((name, index) => ({
      id: `p${index + 1}`,
      name,
      score: 0,
      strike_count: 0,
    }));

    return {
      success: true,
      message: `Registered ${cleaned.length} player(s): ${cleaned.join(', ')}`,
      state: this.getState(),
    };
  }

  /**
   * Selects game mode ('team' or 'pvp')
   */
  public selectMode(mode: GameMode): { success: boolean; message: string; state: AuthoritativeGameState } {
    if (mode === 'pvp') {
      if (this.state.players.length < 2) {
        return {
          success: false,
          message: 'Player vs Player mode requires at least 2 registered players. Please register more players or choose Team Mode.',
          state: this.getState(),
        };
      }
      if (this.state.players.length > 4) {
        return {
          success: false,
          message: 'Player vs Player mode supports a maximum of 4 players.',
          state: this.getState(),
        };
      }
    }

    this.state.mode = mode;
    this.state.status = 'ready';
    return {
      success: true,
      message: `Selected ${mode === 'team' ? 'Team Mode' : 'Player vs Player Mode'}. Ready to start!`,
      state: this.getState(),
    };
  }

  /**
   * Confirms players are ready and deals the first question
   */
  public confirmReady(): { success: boolean; message: string; state: AuthoritativeGameState } {
    if (this.state.players.length === 0) {
      return { success: false, message: 'Cannot start game without registered players.', state: this.getState() };
    }

    this.state.status = 'active';
    this.state.question_index = 1;
    this.state.round_index = 1;
    this.state.is_sudden_death = false;
    this.state.winner_id = null;
    this.state.winner_name = null;

    if (this.state.mode === 'pvp') {
      this.initRoundTurnOrder(1);
    } else {
      this.state.active_player_id = null;
    }

    this.dealNextQuestion();

    return {
      success: true,
      message: 'Game officially started! Let the showdown begin!',
      state: this.getState(),
    };
  }

  /**
   * Evaluates or accepts an answer submission
   */
  public submitAnswer(
    verdict: 'correct' | 'incorrect' | 'clarification_needed',
    recognizedAnswer: string,
    customExplanation?: string
  ): AnswerVerdictResult {
    const cq = this.state.current_question;
    if (!cq || this.state.status !== 'active') {
      return {
        accepted: false,
        verdict,
        points_awarded: 0,
        previous_score: 0,
        new_score: 0,
        correct_answer: cq?.answer_key || '',
        explanation: cq?.explanation || '',
        game_over: this.state.status === 'finished',
      };
    }

    if (verdict === 'clarification_needed') {
      return {
        accepted: true,
        verdict: 'clarification_needed',
        points_awarded: 0,
        previous_score: this.getActiveScore(),
        new_score: this.getActiveScore(),
        correct_answer: cq.answer_key,
        explanation: 'Clarification requested from player.',
        game_over: false,
      };
    }

    const isCorrect = verdict === 'correct';
    const points = isCorrect ? cq.value : 0;
    const prevScore = this.getActiveScore();

    // Update score
    if (this.state.mode === 'team') {
      this.state.team_score += points;
      if (!isCorrect) {
        this.state.strike_count += 1;
      }
    } else {
      const activePlayer = this.getActivePlayer();
      if (activePlayer) {
        activePlayer.score += points;
        if (!isCorrect) {
          activePlayer.strike_count += 1;
          this.state.strike_count += 1;
        }
      }
    }

    cq.answered = true;
    const newScore = this.getActiveScore();

    // Advance game state
    this.advanceTurn();

    return {
      accepted: true,
      verdict,
      points_awarded: points,
      previous_score: prevScore,
      new_score: newScore,
      correct_answer: cq.answer_key,
      explanation: customExplanation || cq.explanation,
      game_over: this.state.status === 'finished',
      winner_name: this.state.winner_name,
      is_sudden_death: this.state.is_sudden_death,
    };
  }

  /**
   * Checks a raw answer string against the current question's answer key and accepted list
   */
  public checkAnswerFuzzy(answerText: string): 'correct' | 'incorrect' | 'clarification_needed' {
    const cq = this.state.current_question;
    if (!cq) return 'incorrect';

    const cleanInput = answerText.trim().toLowerCase().replace(/^(the|a|an)\s+/i, '');
    const cleanKey = cq.answer_key.trim().toLowerCase().replace(/^(the|a|an)\s+/i, '');

    if (cleanInput === cleanKey) return 'correct';

    for (const alt of cq.accepted_answers) {
      const cleanAlt = alt.trim().toLowerCase().replace(/^(the|a|an)\s+/i, '');
      if (cleanInput === cleanAlt) return 'correct';
    }

    // Partial contains check if long enough
    if (cleanKey.length > 4 && cleanInput.includes(cleanKey)) {
      return 'correct';
    }

    return 'incorrect';
  }

  /**
   * Requests a hint for current question (only 1 allowed, no penalty)
   */
  public requestHint(): { success: boolean; hint: string; message: string } {
    const cq = this.state.current_question;
    if (!cq) {
      return { success: false, hint: '', message: 'No active question.' };
    }
    cq.hint_used = true;
    return {
      success: true,
      hint: cq.hint,
      message: `Hint: ${cq.hint}`,
    };
  }

  /**
   * Skips current question (awards 0 points, does NOT count as strike)
   */
  public skipQuestion(): { success: boolean; answer_key: string; explanation: string; state: AuthoritativeGameState } {
    const cq = this.state.current_question;
    if (!cq || this.state.status !== 'active') {
      return { success: false, answer_key: '', explanation: '', state: this.getState() };
    }

    const answerKey = cq.answer_key;
    const explanation = cq.explanation;
    cq.answered = true;

    this.advanceTurn();

    return {
      success: true,
      answer_key: answerKey,
      explanation,
      state: this.getState(),
    };
  }

  /**
   * Pauses the game
   */
  public pauseGame(): AuthoritativeGameState {
    if (this.state.status === 'active') {
      this.state.status = 'paused';
    }
    return this.getState();
  }

  /**
   * Resumes the game
   */
  public resumeGame(): AuthoritativeGameState {
    if (this.state.status === 'paused') {
      this.state.status = 'active';
    }
    return this.getState();
  }

  /**
   * Restarts the game while retaining players and mode
   */
  public restartGame(): AuthoritativeGameState {
    const retainedPlayers = this.state.players.map(p => ({
      ...p,
      score: 0,
      strike_count: 0,
    }));
    const retainedMode = this.state.mode;

    this.state = {
      ...this.getInitialState(),
      players: retainedPlayers,
      mode: retainedMode,
      status: 'ready',
    };

    return this.getState();
  }

  /**
   * Ends game immediately
   */
  public quitGame(): AuthoritativeGameState {
    this.state.status = 'finished';
    return this.getState();
  }

  // --- INTERNAL ENGINE STATE ADVANCEMENT ---

  private getActiveScore(): number {
    if (this.state.mode === 'team') {
      return this.state.team_score;
    }
    const player = this.getActivePlayer();
    return player ? player.score : 0;
  }

  private getActivePlayer(): Player | undefined {
    return this.state.players.find(p => p.id === this.state.active_player_id);
  }

  private initRoundTurnOrder(roundNum: number) {
    const n = this.state.players.length;
    if (n === 0) return;
    // Rotate starting player each round to ensure fairness
    // Round 1: start at 0, Round 2: start at 1 % n, Round 3: start at 2 % n
    const startOffset = (roundNum - 1) % n;
    const order: string[] = [];
    for (let i = 0; i < n; i++) {
      const idx = (startOffset + i) % n;
      order.push(this.state.players[idx].id);
    }
    this.state.turn_order = order;
    this.state.turn_index = 0;
    this.state.active_player_id = order[0];
  }

  private advanceTurn() {
    if (this.state.mode === 'team') {
      // Team mode: 10 questions total
      if (this.state.question_index >= 10) {
        this.finishGame();
      } else {
        this.state.question_index += 1;
        this.dealNextQuestion();
      }
      return;
    }

    // PvP Mode
    if (this.state.is_sudden_death) {
      this.advanceSuddenDeathTurn();
      return;
    }

    // Regular PvP: 3 rounds
    this.state.turn_index += 1;
    if (this.state.turn_index < this.state.turn_order.length) {
      // Next player in current round
      this.state.active_player_id = this.state.turn_order[this.state.turn_index];
      this.state.question_index += 1;
      this.dealNextQuestion();
    } else {
      // Completed current round
      if (this.state.round_index < 3) {
        this.state.round_index += 1;
        this.initRoundTurnOrder(this.state.round_index);
        this.state.question_index += 1;
        this.dealNextQuestion();
      } else {
        // Round 3 finished! Check for winner or sudden death tie
        this.evaluatePvPStandings();
      }
    }
  }

  private evaluatePvPStandings() {
    if (this.state.players.length === 0) {
      this.finishGame();
      return;
    }

    const maxScore = Math.max(...this.state.players.map(p => p.score));
    const tiedPlayers = this.state.players.filter(p => p.score === maxScore);

    if (tiedPlayers.length === 1) {
      // Clear winner!
      this.state.winner_id = tiedPlayers[0].id;
      this.state.winner_name = tiedPlayers[0].name;
      this.finishGame();
    } else {
      // Sudden death tie breaker!
      this.state.is_sudden_death = true;
      this.state.round_index += 1; // Round 4 (Sudden Death)
      this.state.turn_order = tiedPlayers.map(p => p.id);
      this.state.turn_index = 0;
      this.state.active_player_id = this.state.turn_order[0];
      this.state.question_index += 1;
      this.dealNextQuestion();
    }
  }

  private advanceSuddenDeathTurn() {
    this.state.turn_index += 1;
    if (this.state.turn_index < this.state.turn_order.length) {
      // Next tied player in sudden death
      this.state.active_player_id = this.state.turn_order[this.state.turn_index];
      this.state.question_index += 1;
      this.dealNextQuestion();
    } else {
      // End of this sudden death cycle. Did one player pull ahead?
      const tiedPlayerObjects = this.state.players.filter(p => this.state.turn_order.includes(p.id));
      const maxScore = Math.max(...tiedPlayerObjects.map(p => p.score));
      const stillTied = tiedPlayerObjects.filter(p => p.score === maxScore);

      if (stillTied.length === 1) {
        this.state.winner_id = stillTied[0].id;
        this.state.winner_name = stillTied[0].name;
        this.finishGame();
      } else {
        // Still tied! Another sudden death round
        this.state.round_index += 1;
        this.state.turn_order = stillTied.map(p => p.id);
        this.state.turn_index = 0;
        this.state.active_player_id = this.state.turn_order[0];
        this.state.question_index += 1;
        this.dealNextQuestion();
      }
    }
  }

  private finishGame() {
    this.state.status = 'finished';
    this.state.current_question = null;
    this.state.active_player_id = null;

    if (this.state.mode === 'pvp' && !this.state.winner_name && this.state.players.length > 0) {
      const maxScore = Math.max(...this.state.players.map(p => p.score));
      const winners = this.state.players.filter(p => p.score === maxScore);
      if (winners.length > 0) {
        this.state.winner_id = winners[0].id;
        this.state.winner_name = winners[0].name;
      }
    }
  }

  private dealNextQuestion() {
    const targetValue = this.determineNextQuestionValue();
    const question = this.pickUnusedQuestion(targetValue);

    if (question) {
      this.state.used_question_ids.push(question.id);
      this.state.current_question = {
        ...question,
        hint_used: false,
        answered: false,
      };
    } else {
      // Fallback if pool exhausted
      this.state.current_question = {
        id: `q_fallback_${Date.now()}`,
        text: 'What planet is known as the Red Planet?',
        value: targetValue,
        difficulty: targetValue === 25 ? 'easy' : targetValue === 50 ? 'medium' : 'hard',
        category: 'Astronomy',
        answer_key: 'Mars',
        accepted_answers: ['Mars', 'Planet Mars'],
        explanation: 'Mars appears red due to iron oxide rust on its surface.',
        hint: 'It is named after the Roman god of war.',
        hint_used: false,
        answered: false,
      };
    }
  }

  private determineNextQuestionValue(): 25 | 50 | 100 {
    if (this.state.mode === 'team') {
      const qIdx = this.state.question_index;
      if (qIdx <= 3) return 25;
      if (qIdx <= 6) return 50;
      return 100; // Q7-10
    }

    // PvP Mode
    if (this.state.is_sudden_death) {
      return 100;
    }

    if (this.state.round_index === 1) return 25;
    if (this.state.round_index === 2) return 50;
    return 100; // Round 3
  }

  private pickUnusedQuestion(value: 25 | 50 | 100): Question | undefined {
    const candidates = this.questionPool.filter(
      q => q.value === value && !this.state.used_question_ids.includes(q.id)
    );

    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // Secondary fallback: any unused question
    const anyUnused = this.questionPool.filter(q => !this.state.used_question_ids.includes(q.id));
    if (anyUnused.length > 0) {
      return { ...anyUnused[0], value };
    }

    // Reset used if complete cycle
    return this.questionPool.find(q => q.value === value) || this.questionPool[0];
  }
}
