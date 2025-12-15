//src/controllers/playerController.ts

import type { Context } from 'hono';
import { sql } from '../services/db.js';

/**
 * GET /api/players
 * Get all players with optional pagination and filtering
 * Query params: ?page=1&limit=10&team_id=3&position=Forward
 */
export const getPlayers = async (c: Context) => {
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '10', 10);
  const offset = (page - 1) * limit;

  const teamId = c.req.query('team_id');
  const position = c.req.query('position');

  // Base query
  let query = sql`SELECT p.id, p.name, p.date_of_birth, p.nationality, p.photo_url, p.position
                  FROM players p`;

  const conditions: string[] = [];
  const params: any[] = [];

  if (teamId) {
    // Join player_team_history to filter by current team
    query = sql`${query} INNER JOIN player_team_history h ON p.id = h.player_id AND h.end_date IS NULL`;
    conditions.push(`h.team_id = ${teamId}`);
  }

  if (position) {
    conditions.push(`p.position = ${position}`);
  }

  if (conditions.length > 0) {
    query = sql`${query} WHERE ${sql(conditions.join(' AND '))}`;
  }

  // Add ordering, pagination
  query = sql`${query} ORDER BY p.name LIMIT ${limit} OFFSET ${offset}`;

  const players = await query;

  return c.json({ page, limit, data: players });
};

/**
 * GET /api/players/:id
 * Get a specific player by ID
 */
export const getPlayerById = async (c: Context) => {
  const id = c.req.param('id');

  const [player] = await sql`
    SELECT p.id, p.name, p.date_of_birth, p.nationality, p.photo_url, p.position
    FROM players p
    WHERE p.id = ${id}
  `;

  if (!player) return c.json({ error: 'Player not found' }, 404);
  const [stats] = await sql`
    SELECT 
      COUNT(CASE WHEN e.event_type = 'goal' THEN 1 END) as goalsScored,
      COUNT(CASE WHEN e.event_type = 'yellow_card' THEN 1 END) as yellowCards,
      COUNT(CASE WHEN e.event_type = 'red_card' THEN 1 END) as redCards
    FROM match_events e
    WHERE e.player_id = ${id}
  `;

  const [history] = await sql`
  SELECT
    h.team_id   AS "teamId",
    h.start_date AS "startDate",
    h.end_date   AS "endDate",
    t.name       AS "teamName"
  FROM player_team_history h
  JOIN teams t ON h.team_id = t.id
  WHERE h.player_id = ${id}
`;

  const events = await sql`
    SELECT
      e.event_type,
      e.minute,
      e.match_id,
      e.player_id,
      e.assisting_player_id,
      m.date AS match_date,
      m.competition_id as competitionId,
      m.home_team_id as homeTeamId,
      m.away_team_id as awayTeamId,
      m.score_home as homeTeamScore,
      m.score_away as awayTeamScore,
      m.venue as matchVenue
    FROM match_events e
    JOIN matches m ON e.match_id = m.id
    WHERE e.player_id = ${id} OR e.assisting_player_id = ${id}
    ORDER BY m.date DESC, e.minute
  `;
  const lastFiveMatchIds: number[] = [];
  const evs = events as any[];
  for (const ev of evs) {
    if (!lastFiveMatchIds.includes(ev.match_id)) {
      lastFiveMatchIds.push(ev.match_id);
      if (lastFiveMatchIds.length === 5) break;
    }
  }

  const filteredEvents = evs.filter(ev => lastFiveMatchIds.includes(ev.match_id));

  console.log(filteredEvents)

  const byMatch: Record<number, { date: any; competitionId: number; homeTeamId: number; awayTeamId: number; homeTeamScore: number; awayTeamScore: number; matchVenue: string; events: any[] }> = {};
  for (const e of filteredEvents) {
    console.log(e.competitionId)
    if (!byMatch[e.match_id]) byMatch[e.match_id] = {
      date: e.match_date,
      competitionId: e.competitionid,
      homeTeamId: e.awayteamid,
      awayTeamId: e.awayteamid,
      homeTeamScore: e.hometeamscore,
      awayTeamScore: e.awayteamscore,
      matchVenue: e.matchvenue,
      events: []
    };
    console.log(byMatch)
    byMatch[e.match_id].events.push({
      type: e.event_type,
      minute: e.minute,
      player_id: e.player_id,
      assisting_player_id: e.assisting_player_id
    });
  }

  const last_matches = lastFiveMatchIds.map(mid => ({
    id: mid,
    date: byMatch[mid]?.date,
    events: byMatch[mid]?.events || [],
    competitionId: byMatch[mid]?.competitionId,
    homeTeamId: byMatch[mid]?.homeTeamId,
    awayTeamId: byMatch[mid]?.awayTeamId,
    homeTeamScore: byMatch[mid]?.homeTeamScore,
    awayTeamScore: byMatch[mid]?.awayTeamScore,
    matchVenue: byMatch[mid]?.matchVenue,
  }));

  (player as any).last_matches = last_matches;
  (player as any).stats = stats;
  (player as any).history = history;


  return c.json(player);
};


/**
 * GET /api/players/search?name=...
 * Search players by name (partial match)
 */
export const searchPlayers = async (c: Context) => {
  const name = c.req.query('name');

  if (!name) return c.json({ error: 'Name query param is required' }, 400);

  const players = await sql`
    SELECT p.id, p.name, p.date_of_birth, p.nationality, p.photo_url, p.position
    FROM players p
    WHERE p.name ILIKE ${`%${name}%`}
    ORDER BY p.name
    LIMIT 50
  `;

  return c.json(players);
};
