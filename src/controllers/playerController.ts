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
 * Get a specific player by ID with comprehensive stats
 */
export const getPlayerById = async (c: Context) => {
  const id = c.req.param('id');

  // Main player query with aggregated stats
  const playerQuery = sql`
    WITH player_stats AS (
      SELECT 
        p.id,
        p.name,
        p.date_of_birth,
        p.nationality,
        p.photo_url,
        p.position,
        COALESCE(COUNT(DISTINCT me.match_id), 0) as matches_played,
        COALESCE(COUNT(CASE WHEN me.event_type = 'goal' THEN 1 END), 0) as goals_scored,
        COALESCE(COUNT(CASE WHEN me.event_type = 'yellow_card' THEN 1 END), 0) as yellow_cards,
        COALESCE(COUNT(CASE WHEN me.event_type = 'red_card' THEN 1 END), 0) as red_cards
      FROM players p
      LEFT JOIN match_events me ON p.id = me.player_id
      WHERE p.id = ${id}
      GROUP BY p.id, p.name, p.date_of_birth, p.nationality, p.photo_url, p.position
    ),
    career_history AS (
      SELECT 
        p.id as player_id,
        jsonb_agg(
          jsonb_build_object(
            'team', t.name,
            'period', CONCAT(
              TO_CHAR(pth.start_date, 'YYYY'),
              '-',
              CASE 
                WHEN pth.end_date IS NULL THEN 'Present'
                ELSE TO_CHAR(pth.end_date, 'YYYY')
              END
            )
          ) ORDER BY pth.start_date DESC
        ) as career_history
      FROM players p
      JOIN player_team_history pth ON p.id = pth.player_id
      JOIN teams t ON pth.team_id = t.id
      WHERE p.id = ${id}
      GROUP BY p.id
    ),
    player_last_matches AS (
      SELECT 
        p.id as player_id,
        jsonb_agg(
          jsonb_build_object(
            'date', TO_CHAR(m.date, 'Mon DD, YYYY'),
            'opponent', CASE 
              WHEN m.home_team_id = pth.team_id THEN away_team.short_name
              ELSE home_team.short_name
            END,
            'result', CONCAT(
              CASE WHEN m.home_team_id = pth.team_id THEN m.score_home ELSE m.score_away END,
              '-',
              CASE WHEN m.home_team_id = pth.team_id THEN m.score_away ELSE m.score_home END
            ),
            'events', COALESCE(player_events.events, '[]'::jsonb)
          ) ORDER BY m.date DESC
        ) as last_matches
      FROM (
        SELECT DISTINCT p.id, pth.team_id, m.date, m.home_team_id, m.away_team_id, m.score_home, m.score_away
        FROM players p
        JOIN match_events me ON p.id = me.player_id
        JOIN matches m ON me.match_id = m.id
        JOIN player_team_history pth ON p.id = pth.player_id 
          AND (m.date >= pth.start_date AND (m.date <= pth.end_date OR pth.end_date IS NULL))
        WHERE p.id = ${id}
        ORDER BY m.date DESC
        LIMIT 5
      ) pm
      JOIN players p ON p.id = pm.id
      JOIN matches m ON m.date = pm.date AND m.home_team_id = pm.home_team_id AND m.away_team_id = pm.away_team_id
      JOIN player_team_history pth ON pth.player_id = p.id AND pth.team_id = pm.team_id
      JOIN teams home_team ON m.home_team_id = home_team.id
      JOIN teams away_team ON m.away_team_id = away_team.id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'type', 
            CASE 
              WHEN me2.event_type = 'goal' THEN 'Goal'
              WHEN me2.event_type = 'yellow_card' THEN 'Yellow Card'
              WHEN me2.event_type = 'red_card' THEN 'Red Card'
            END,
            'minute', me2.minute
          ) ORDER BY me2.minute
        ) as events
        FROM match_events me2
        WHERE me2.match_id = m.id AND me2.player_id = p.id
      ) player_events ON true
      GROUP BY p.id
    )
    SELECT 
      ps.id,
      ps.name,
      ps.position,
      ps.nationality,
      ps.photo_url,
      ps.date_of_birth,
      ps.matches_played,
      ps.goals_scored,
      ps.yellow_cards,
      ps.red_cards,
      COALESCE(ch.career_history, '[]'::jsonb) as career_history,
      COALESCE(plm.last_matches, '[]'::jsonb) as last_matches
    FROM player_stats ps
    LEFT JOIN career_history ch ON ps.id = ch.player_id
    LEFT JOIN player_last_matches plm ON ps.id = plm.player_id
  `;

  const [player] = await playerQuery;

  if (!player) {
    return c.json({ error: 'Player not found' }, 404);
  }

  // Format the response to match the expected structure
  const formattedPlayer = {
    name: player.name,
    position: player.position,
    nationality: player.nationality,
    careerHistory: player.career_history?.map((item: any) => 
      `${item.team} (${item.period})`
    ) || [],
    matchesPlayed: parseInt(player.matches_played) || 0,
    goalsScored: parseInt(player.goals_scored) || 0,
    yellowCards: parseInt(player.yellow_cards) || 0,
    redCards: parseInt(player.red_cards) || 0,
    lastMatches: player.last_matches?.map((match: any) => ({
      date: match.date,
      opponent: match.opponent,
      result: match.result,
      events: match.events || []
    })) || []
  };

  return c.json(formattedPlayer);
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
