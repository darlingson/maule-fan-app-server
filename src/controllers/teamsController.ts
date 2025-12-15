// src/controllers/teamsController.ts
import type { Context } from 'hono';
import { sql } from '../services/db.js';

const isoDateToDateStr = (d: string) => new Date(d).toISOString().slice(0, 10);
const now = () => new Date();


/**
 * GET /api/teams
 * Get all teams with optional pagination
 * Query params: ?page=1&limit=20
 */
export const getTeams = async (c: Context) => {
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = (page - 1) * limit;

  const rows = await sql`
    SELECT id, name, short_name, logo_url, country
    FROM teams
    ORDER BY name
    LIMIT ${limit} OFFSET ${offset}
  `;
  return c.json({ page, limit, data: rows });
};

/**
 * GET /api/teams/:id
 * Get a specific team by ID
 */
export const getTeamById = async (c: Context) => {
  const id = c.req.param('id');
  const [row] = await sql`
    SELECT id, name, short_name, logo_url, country
    FROM teams
    WHERE id = ${id}
  `;
  if (!row) return c.json({ message: 'Team not found' }, 404);
  return c.json(row);
};

/**
 * GET /api/teams/:id/players
 * Get current players for a team
 * Query params: ?page=1&limit=20
 */
export const getTeamPlayers = async (c: Context) => {
  const id = c.req.param('id');
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = (page - 1) * limit;

  /* players whose last history row has this team and no end_date */
  const rows = await sql`
    SELECT p.id,
           p.name,
           p.position,
           p.nationality,
           p.photo_url,
           p.date_of_birth
    FROM players p
    JOIN (
        SELECT DISTINCT ON (player_id) player_id, start_date
        FROM player_team_history
        WHERE team_id = ${id}
        ORDER BY player_id, start_date DESC
    ) h ON h.player_id = p.id
    WHERE NOT EXISTS (
        SELECT 1
        FROM player_team_history
        WHERE player_id = p.id
          AND team_id <> ${id}
          AND start_date > h.start_date
    )
    ORDER BY p.name
    LIMIT ${limit} OFFSET ${offset}
  `;
  return c.json({ page, limit, data: rows });
};

/**
 * GET /api/teams/:id/matches
 * Get matches for a team
 * Query params: ?page=1&limit=10&date=2025-12-13
 */
export const getTeamMatches = async (c: Context) => {
  const id = c.req.param('id');
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '10', 10);
  const offset = (page - 1) * limit;
  const date = c.req.query('date');

  const rows = await sql`
    SELECT m.id,
           m.date,
           m.score_home,
           m.score_away,
           m.venue,
           comp.name   AS comp_name,
           comp.season AS comp_season,
           ht.short_name AS home_short,
           ht.logo_url   AS home_logo,
           at.short_name AS away_short,
           at.logo_url   AS away_logo
    FROM matches m
    JOIN competitions comp ON comp.id = m.competition_id
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE (m.home_team_id = ${id} OR m.away_team_id = ${id})
      ${date ? sql`AND m.date::date = ${date}::date` : sql``}
    ORDER BY m.date DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const data = rows.map(r => {
    const isPast = new Date(r.date) < now();
    const status = !isPast ? 'UPCOMING' :
      (r.score_home === null && r.score_away === null) ? 'LIVE' : 'FT';

    return {
      id: r.id,
      date: r.date,
      venue: r.venue,
      status,
      score: { home: r.score_home, away: r.score_away },

      competition: { name: r.comp_name, season: r.comp_season },

      home_team: { short_name: r.home_short, logo_url: r.home_logo },
      away_team: { short_name: r.away_short, logo_url: r.away_logo },
    };
  });

  return c.json({ page, limit, data });
};

/**
 * GET /api/teams/:id/matches/events
 * Get match events for a team with goals and red cards
 * Query params: ?page=1&limit=10&date=2025-12-13
 */
export const getTeamMatchesEvents = async (c: Context) => {
  const id = c.req.param('id');
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '10', 10);
  const offset = (page - 1) * limit;
  const date = c.req.query('date');

  // First query: get matches
  const matches = await sql`
    SELECT m.id,
           m.date,
           m.score_home,
           m.score_away,
           m.venue,
           comp.name   AS comp_name,
           comp.season AS comp_season,
           ht.short_name AS home_short,
           ht.logo_url   AS home_logo,
           at.short_name AS away_short,
           at.logo_url   AS away_logo
    FROM matches m
    JOIN competitions comp ON comp.id = m.competition_id
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE (m.home_team_id = ${id} OR m.away_team_id = ${id})
      ${date ? sql`AND m.date::date = ${date}::date` : sql``}
    ORDER BY m.date DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  // Get match IDs for events query
  const matchIds = matches.map(m => m.id);
  
  if (matchIds.length === 0) {
    return c.json({ 
      page, 
      limit, 
      data: matches.map(r => ({
        id: r.id,
        date: r.date,
        venue: r.venue,
        status: new Date(r.date) < now() ? 
          (r.score_home === null && r.score_away === null ? 'LIVE' : 'FT') : 'UPCOMING',
        score: { home: r.score_home, away: r.score_away },
        competition: { name: r.comp_name, season: r.comp_season },
        home_team: { short_name: r.home_short, logo_url: r.home_logo },
        away_team: { short_name: r.away_short, logo_url: r.away_logo },
        events: { goals: [], red_cards: [] }
      }))
    });
  }

  // Get events only for matches in our current pagination window
  // We'll get a reasonable buffer to account for potential event density
  const eventsBufferSize = Math.max(limit * 2, 20); // At least 20, but scale with page size
  
  const events = await sql`
    SELECT me.match_id,
           me.event_type,
           me.player_id,
           me.minute,
           me.assisting_player_id
    FROM match_events me
    WHERE me.match_id IN (
      SELECT m.id 
      FROM matches m 
      WHERE (m.home_team_id = ${id} OR m.away_team_id = ${id})
      ORDER BY m.date DESC
      LIMIT ${eventsBufferSize} OFFSET ${offset}
    )
    AND me.event_type IN ('goal', 'red_card')
    ORDER BY me.minute ASC
  `;

  // Define proper types
  interface Event {
    id: number;
    player_id: number;
    minute: number;
    assisting_player_id?: number;
  }

  interface MatchEvents {
    goals: Event[];
    red_cards: Event[];
  }

  interface EventsByMatch {
    [key: number]: MatchEvents;
  }

  // Group events by match ID
  const eventsByMatch: EventsByMatch = {};
  
  events.forEach(event => {
    if (!eventsByMatch[event.match_id]) {
      eventsByMatch[event.match_id] = { goals: [], red_cards: [] };
    }

    if (event.event_type === 'goal') {
      eventsByMatch[event.match_id].goals.push({
        id: event.id,
        player_id: event.player_id,
        minute: event.minute,
        assisting_player_id: event.assisting_player_id
      });
    } else if (event.event_type === 'red_card') {
      eventsByMatch[event.match_id].red_cards.push({
        id: event.id,
        player_id: event.player_id,
        minute: event.minute
      });
    }
  });

  const data = matches.map(r => {
    const isPast = new Date(r.date) < now();
    const status = !isPast ? 'UPCOMING' :
      (r.score_home === null && r.score_away === null ? 'LIVE' : 'FT');

    return {
      id: r.id,
      date: r.date,
      venue: r.venue,
      status,
      score: { home: r.score_home, away: r.score_away },
      competition: { name: r.comp_name, season: r.comp_season },
      home_team: { short_name: r.home_short, logo_url: r.home_logo },
      away_team: { short_name: r.away_short, logo_url: r.away_logo },
      events: eventsByMatch[r.id] || { goals: [], red_cards: [] }
    };
  });

  return c.json({ page, limit, data });
};


/**
 * GET /api/teams/:id/competitions
 * Get competitions that a team participates in
 * Query params: ?season=2025/26
 */
export const getTeamCompetitions = async (c: Context) => {
  const id = c.req.param('id');
  const season = c.req.query('season');

  const rows = await sql`
    SELECT DISTINCT
           comp.id,
           comp.name,
           comp.type,
           comp.season
    FROM competitions comp
    JOIN matches m ON m.competition_id = comp.id
    WHERE (m.home_team_id = ${id} OR m.away_team_id = ${id})
      ${season ? sql`AND comp.season = ${season}` : sql``}
    ORDER BY comp.season DESC, comp.name
  `;
  return c.json({ data: rows });
};
