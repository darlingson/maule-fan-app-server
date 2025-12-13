// src/controllers/competitionController.ts
import type { Context } from 'hono';
import { sql } from '../services/db.js';

/**
 * GET /api/competitions
 * Get all competitions with optional pagination and filtering
 * Query params: ?page=1&limit=10&type=league&season=2025/26
 */
export const getCompetitions = async (c: Context) => {
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '10', 10);
  const offset = (page - 1) * limit;
  const type = c.req.query('type');
  const season = c.req.query('season');

  let query = sql`SELECT id, name, type, season FROM competitions`;
  const conditions: string[] = [];
  const params: any[] = [];

  if (type) {
    conditions.push(`type = ${type}`);
  }
  if (season) {
    conditions.push(`season = ${season}`);
  }

  if (conditions.length > 0) {
    query = sql`${query} WHERE ${sql(conditions.join(' AND '))}`;
  }

  query = sql`${query} ORDER BY name LIMIT ${limit} OFFSET ${offset}`;
  const competitions = await query;
  return c.json({ page, limit, data: competitions });
};

/**
 * GET /api/competitions/:id
 * Get a specific competition by ID
 */
export const getCompetitionById = async (c: Context) => {
  const id = c.req.param('id');
  const [competition] = await sql`
    SELECT id, name, type, season
    FROM competitions
    WHERE id = ${id}
  `;
  if (!competition) return c.json({ error: 'Competition not found' }, 404);
  return c.json(competition);
};

/**
 * GET /api/competitions/:id/matches
 * Get matches for a specific competition
 * Query params: ?page=1&limit=10&date=2025-12-13
 */
export const getCompetitionMatches = async (c: Context) => {
  const id = c.req.param('id');
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '10', 10);
  const offset = (page - 1) * limit;
  const date = c.req.query('date');

  let query = sql`
    SELECT m.id, m.date, m.score_home, m.score_away, m.venue,
           ht.name as home_team_name, at.name as away_team_name
    FROM matches m
    INNER JOIN teams ht ON m.home_team_id = ht.id
    INNER JOIN teams at ON m.away_team_id = at.id
    WHERE m.competition_id = ${id}
  `;
  const conditions: string[] = [];

  if (date) {
    conditions.push(`m.date = ${date}`);
  }

  if (conditions.length > 0) {
    query = sql`${query} WHERE ${sql(conditions.join(' AND '))}`;
  }

  query = sql`${query} ORDER BY m.date DESC LIMIT ${limit} OFFSET ${offset}`;
  const matches = await query;
  return c.json({ page, limit, data: matches });
};