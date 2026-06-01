// ─── Enums ────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "organizer" | "player";

export type TournamentFormat =
  | "single_elimination"
  | "double_elimination"
  | "round_robin";

export type TournamentStatus =
  | "draft"
  | "registration"
  | "in_progress"
  | "completed"
  | "cancelled";

export type MatchStatus = "pending" | "in_progress" | "completed" | "bye";

export type ParticipantType =
  | "individual"
  | "parejas"
  | "parejas_ciegas"
  | "trios"
  | "equipos";

export type TeamMemberRole = "captain" | "member";

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  elo: number;
  createdAt: string;
  dni?: string | null;
  phone?: string | null;
  province?: string | null;
  birthDate?: string | null;
  gdprConsent?: boolean;
  whatsappConsent?: boolean;
  emailConsent?: boolean;
  emailVerified?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

// ─── Team ─────────────────────────────────────────────────────────────────────

export interface TeamMember {
  userId: string;
  user: Pick<User, "id" | "name" | "avatarUrl" | "elo">;
  role: TeamMemberRole;
  joinedAt: string;
}

export interface Team {
  id: string;
  name: string;
  logoUrl?: string;
  createdBy: string;
  members: TeamMember[];
  createdAt: string;
}

// ─── Tournament ───────────────────────────────────────────────────────────────

export type GameType = "01" | "cricket" | "combo";
export type Metric   = "ppd" | "mpr" | "combined";

export interface TournamentLevel {
  id:               string;
  name:             string;
  minValue:         number;
  maxValue?:        number;
  maxParticipants?: number; // null/undefined = sin límite
  order:            number;
  bestOf?:          number | null; // match format for this level (odd 1-21); null = inherit global
  bestOfLosers?:    number | null; // losers bracket override; null = same as bestOf
}

export interface Tournament {
  id: string;
  name: string;
  description?: string;
  format: TournamentFormat;
  status: TournamentStatus;
  maxParticipants: number;
  participantType: ParticipantType;
  rules?: string;
  startDate?: string;
  gameType?:      GameType;
  metric?:        Metric;
  levels:         TournamentLevel[];
  bestOf:                 number;         // 1 | 3 | 5 | 7
  bestOfLosers?:          number | null;  // null = same as bestOf (only for double_elimination)
  winnerOnly:             boolean;        // skip score entry, just pick a winner
  estimatedMatchMinutes:  number;         // alert threshold in GestionTab (default 15)
  rrGroupSize?:       number | null;      // 3–8; null for non-RR
  rrAdvancingTeams?:  number | null;      // 2–4; null for non-RR
  teamSize?:          number | null;      // for equipos: max players per team (3–7)
  teamSizeMin?:       number | null;      // for equipos: minimum required players per team (≤ teamSize)
  metricPlayers?:     number | null;      // for equipos: how many top players count for the metric (≤ teamSize)
  maxMetric?:         number | null;      // registration cap — players above this cannot sign up
  imageUrl?:          string | null;      // tournament cover photo
  allowPlayerReg?:    boolean;
  createdBy: string;
  organizer: Pick<User, "id" | "name" | "avatarUrl">;
  participantsCount: number;
  createdAt: string;
}

export interface CreateTournamentRequest {
  name: string;
  description?: string;
  format: TournamentFormat;
  maxParticipants: number;
  participantType: ParticipantType;
  rules?: string;
  startDate?: string;
  gameType?: GameType;
  metric?:   Metric;
  levels?:   Omit<TournamentLevel, "id">[];
}

// ─── Player Records ────────────────────────────────────────────────────────────

export interface PlayerRecord {
  id:           string;
  name:         string;
  dni?:         string;
  cardNumber?:  string;
  teamName?:    string;
  grupo?:       string;
  stageName?:   string;
  season:       string;
  gameType?:    GameType;   // optional — file may contain stats for multiple game types
  ppd?:         number;
  mpr?:         number;
  gamesPlayed?: number;
  combined?:    number;
  level?:       string;
  provincia?:   string;
  createdAt:    string;
}

// ─── Participant ──────────────────────────────────────────────────────────────

export interface Participant {
  id: string;
  tournamentId: string;
  entityType: ParticipantType;
  entityId: string;
  seed?: number;
  finalRank?: number;
  rrGroup?: string | null;
  level?: string | null;
  metricValue?: number | null;
  gamesPlayed?: number | null;
  dni?: string | null;
  paymentStatus?: "pending" | "paid" | null;
  paymentMethod?: "cash" | "card" | null;
  inscriptionStatus?: "confirmed" | "pending" | "rejected";
  user?: Pick<User, "id" | "name" | "avatarUrl" | "elo">;
  team?: Pick<Team, "id" | "name" | "logoUrl"> & { members: (Pick<TeamMember, "role" | "user"> & { metricValue?: number | null })[] };
  registeredAt: string;
}

// ─── Diana ────────────────────────────────────────────────────────────────────

export interface Diana {
  id: string;
  tournamentId: string;
  number: number;
  matchId?: string | null;
  match?: Match | null;
  posX?: number | null;
  posY?: number | null;
  room?: string | null;
  broken?: boolean;
}

// ─── Match ────────────────────────────────────────────────────────────────────

export interface Match {
  id: string;
  tournamentId: string;
  round: number;
  position: number;
  bracketSide?: "winners" | "losers"; // for double elimination
  bracketLevel?: string | null;       // level name for multi-level tournaments
  rrGroup?: string | null;            // "A","B","C"… only for RR matches
  reviewed?: boolean;                 // organizer approved this RR result
  isTiebreaker?: boolean;             // tiebreaker match in RR phase
  participant1?: Participant;
  participant2?: Participant;
  participant3?: Participant | null;  // only set for 3-player tiebreaker
  participant1Id?: string | null;
  participant2Id?: string | null;
  participant3Id?: string | null;     // only set for 3-player tiebreaker
  score1?: number;
  score2?: number;
  winnerId?: string;
  status: MatchStatus;
  scheduledAt?: string;
  playedAt?: string;
  // Diana / call tracking
  diana?: Diana | null;
  launch1At?: string | null;
  launch2At?: string | null;
  launch3At?: string | null;
  noShowAt?: string | null;
  noShowReason?: string | null;
}

export interface ReportResultRequest {
  score1?: number;
  score2?: number;
  winnerId?: string; // used when tournament.winnerOnly = true
}

// ─── Round Robin Standings ────────────────────────────────────────────────────

export interface RRStanding {
  participantId: string;
  participant?: Participant;
  points: number;
  wins: number;
  losses: number;
  setDiff: number;
  rank: number;
  advances: boolean;
  needsTiebreaker?: boolean; // only set on entries that are part of an unresolved 3-way tie
}

export interface RRGroup {
  name: string;
  standings: RRStanding[];
  allMatchesDone: boolean;
  reviewed: boolean;
  hasTiebreaker: boolean; // at least one 3-way tie that could not be resolved by set-diff
}

export interface RRStandingsResponse {
  groups: RRGroup[];
}

// ─── Bracket ──────────────────────────────────────────────────────────────────

export interface BracketRound {
  round: number;
  name: string; // "Round of 16", "Quarterfinals", etc.
  matches: Match[];
}

export interface Bracket {
  tournamentId: string;
  format: TournamentFormat;
  rounds: BracketRound[]; // winners / all rounds
  losersRounds?: BracketRound[]; // only for double elimination
}

// ─── User Search ──────────────────────────────────────────────────────────────

export interface UserSearchResult {
  id: string;
  name: string;
  email: string;
  elo: number;
  avatarUrl?: string;
  alreadyRegistered?: boolean;
}

// ─── Stats & Rankings ─────────────────────────────────────────────────────────

export interface PlayerStats {
  userId: string;
  user: Pick<User, "id" | "name" | "avatarUrl" | "elo">;
  wins: number;
  losses: number;
  draws: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
  winRate: number;
}

export interface RankingEntry extends PlayerStats {
  rank: number;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
  statusCode: number;
}
