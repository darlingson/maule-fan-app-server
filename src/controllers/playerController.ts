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
