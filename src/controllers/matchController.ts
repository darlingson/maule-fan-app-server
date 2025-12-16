// src/controllers/matchController.ts
import type { Context } from 'hono';
import { sql } from '../services/db.js';

/**
 * GET /api/matches
 * Get all matches with optional pagination and filtering
 * Query params: ?page=1&limit=10&competition_id=1&date=2025-12-13&team_id=3
 */
export const getMatches = async (c: Context) => {
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '10', 10);
  const offset = (page - 1) * limit;
  const competitionId = c.req.query('competition_id');
  const date = c.req.query('date');
  const teamId = c.req.query('team_id');

  let query = sql`
    SELECT m.id, m.competition_id, m.date, m.score_home, m.score_away, m.venue,
           ht.name as home_team_name, at.name as away_team_name
    FROM matches m
    INNER JOIN teams ht ON m.home_team_id = ht.id
    INNER JOIN teams at ON m.away_team_id = at.id
  `;
  const conditions: string[] = [];

  if (competitionId) {
    conditions.push(`m.competition_id = ${competitionId}`);
  }
  if (date) {
    conditions.push(`m.date = ${date}`);
  }
  if (teamId) {
    conditions.push(`(m.home_team_id = ${teamId} OR m.away_team_id = ${teamId})`);
  }

  if (conditions.length > 0) {
    query = sql`${query} WHERE ${sql(conditions.join(' AND '))}`;
  }

  query = sql`${query} ORDER BY m.date DESC LIMIT ${limit} OFFSET ${offset}`;
  const matches = await query;
  return c.json({ page, limit, data: matches });
};

/**
 * GET /api/matches/:id
 * Get a specific match by ID
 */
export const getMatchById = async (c: Context) => {
  const id = c.req.param('id');
  const [match] = await sql`
    SELECT m.id, m.competition_id, m.date, m.score_home, m.score_away, m.venue,
           ht.name as home_team_name, ht.id as home_team_id,
           at.name as away_team_name, at.id as away_team_id
    FROM matches m
    INNER JOIN teams ht ON m.home_team_id = ht.id
    INNER JOIN teams at ON m.away_team_id = at.id
    WHERE m.id = ${id}
  `;
  if (!match) return c.json({ error: 'Match not found' }, 404);
  return c.json(match);
};

/**
 * GET /api/matches/:id/events
 * Get events for a specific match
 * Query params: ?event_type=goal&player_id=5
 */
export const getMatchEvents = async (c: Context) => {
  const id = c.req.param('id');
  const eventType = c.req.query('event_type');
  const playerId = c.req.query('player_id');

  let query = sql`
    SELECT e.id, e.event_type, e.minute, e.player_id, p.name as player_name,
           e.assisting_player_id, ap.name as assisting_player_name
    FROM match_events e
    INNER JOIN players p ON e.player_id = p.id
    LEFT JOIN players ap ON e.assisting_player_id = ap.id
    WHERE e.match_id = ${id}
  `;
  const conditions: string[] = [];

  if (eventType) {
    conditions.push(`e.event_type = ${eventType}`);
  }
  if (playerId) {
    conditions.push(`e.player_id = ${playerId}`);
  }

  if (conditions.length > 0) {
    query = sql`${query} WHERE ${sql(conditions.join(' AND '))}`;
  }

  query = sql`${query} ORDER BY e.minute ASC`;
  const events = await query;
  return c.json(events);
};

/**
 * GET /api/matches/:id/details
 * Get complete match details including match info and all events
 * Combines match data and events into single response
 */
export const getMatchDetails = async (c: Context) => {
  const id = c.req.param('id');

  const [match] = await sql`
    SELECT m.id, 
           m.competition_id, 
           m.date, 
           m.score_home, 
           m.score_away, 
           m.venue,
           comp.name as competition_name,
           comp.season as competition_season,
           ht.name as home_team_name, 
           ht.id as home_team_id,
           ht.short_name as home_team_short,
           ht.logo_url as home_team_logo,
           at.name as away_team_name, 
           at.id as away_team_id,
           at.short_name as away_team_short,
           at.logo_url as away_team_logo
    FROM matches m
    INNER JOIN teams ht ON m.home_team_id = ht.id
    INNER JOIN teams at ON m.away_team_id = at.id
    INNER JOIN competitions comp ON m.competition_id = comp.id
    WHERE m.id = ${id}
  `;

  if (!match) return c.json({ error: 'Match not found' }, 404);

  const events = await sql`
    SELECT e.id, 
           e.event_type, 
           e.minute, 
           e.player_id, 
           p.name as player_name,
           p.position as player_position,
           e.assisting_player_id, 
           ap.name as assisting_player_name,
           ap.position as assisting_player_position
    FROM match_events e
    INNER JOIN players p ON e.player_id = p.id
    LEFT JOIN players ap ON e.assisting_player_id = ap.id
    WHERE e.match_id = ${id}
    ORDER BY e.minute ASC
  `;

  const goals = events.filter(e => e.event_type === 'goal');
  const yellowCards = events.filter(e => e.event_type === 'yellow_card');
  const redCards = events.filter(e => e.event_type === 'red_card');

  const isPast = new Date(match.date) < new Date();
  const status = !isPast ? 'UPCOMING' : (match.score_home === null && match.score_away === null ? 'LIVE' : 'FT');

  return c.json({
    id: match.id,
    date: match.date,
    venue: match.venue,
    status,
    score: { home: match.score_home, away: match.score_away },
    competition: {
      id: match.competition_id,
      name: match.competition_name,
      season: match.competition_season
    },
    home_team: {
      id: match.home_team_id,
      name: match.home_team_name,
      short_name: match.home_team_short,
      logo_url: match.home_team_logo
    },
    away_team: {
      id: match.away_team_id,
      name: match.away_team_name,
      short_name: match.away_team_short,
      logo_url: match.away_team_logo
    },
    events: {
      goals: goals.map(e => ({
        id: e.id,
        minute: e.minute,
        player: { id: e.player_id, name: e.player_name, position: e.player_position },
        assisting_player: e.assisting_player_id ? {
          id: e.assisting_player_id,
          name: e.assisting_player_name,
          position: e.assisting_player_position
        } : null
      })),
      yellow_cards: yellowCards.map(e => ({
        id: e.id,
        minute: e.minute,
        player: { id: e.player_id, name: e.player_name, position: e.player_position }
      })),
      red_cards: redCards.map(e => ({
        id: e.id,
        minute: e.minute,
        player: { id: e.player_id, name: e.player_name, position: e.player_position }
      }))
    }
  });
};