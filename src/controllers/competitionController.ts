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
  const page  = parseInt(c.req.query('page')  || '1',  10);
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
    WHERE m.competition_id = ${id}
      ${date ? sql`AND m.date::date = ${date}::date` : sql``}
    ORDER BY m.date DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const now = new Date();

  const data = rows.map(r => {
    const matchDate = new Date(r.date);
    const isPast  = matchDate < now;
    const isToday = matchDate.toDateString() === now.toDateString();

    let status: string;
    if (!isPast && !isToday) status = 'UPCOMING';
    else if (isToday && r.score_home === null && r.score_away === null) status = 'LIVE';
    else status = 'FT';

    return {
      id: r.id,
      date: r.date,
      venue: r.venue,
      status,
      score: { home: r.score_home, away: r.score_away },

      competition: {
        name: r.comp_name,
        season: r.comp_season,
      },

      home_team: {
        short_name: r.home_short,
        logo_url: r.home_logo,
      },

      away_team: {
        short_name: r.away_short,
        logo_url: r.away_logo,
      },
    };
  });

  return c.json({ page, limit, data });
};


/**
 * GET /api/competitions/:id/matches/events
 * Get matches for a competition including per-match events
 * Query params: ?page=1&limit=10&date=2025-12-13
 */
export const getCompetitionMatchesEvents = async (c: Context) => {
  const id = c.req.param('id');
  const page  = parseInt(c.req.query('page')  || '1',  10);
  const limit = parseInt(c.req.query('limit') || '10', 10);
  const offset = (page - 1) * limit;
  const date = c.req.query('date');

  let base = sql`
    SELECT m.id,
           m.date,
           m.score_home,
           m.score_away,
           m.venue,

           comp.id           AS comp_id,
           comp.name         AS comp_name,
           comp.type         AS comp_type,
           comp.season       AS comp_season,

           ht.id             AS home_team_id,
           ht.name           AS home_team_name,
           ht.short_name     AS home_team_short,
           ht.logo_url       AS home_team_logo,
           ht.country        AS home_team_country,

           at.id             AS away_team_id,
           at.name           AS away_team_name,
           at.short_name     AS away_team_short,
           at.logo_url       AS away_team_logo,
           at.country        AS away_team_country
    FROM matches m
    JOIN competitions comp ON comp.id = m.competition_id
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE m.competition_id = ${id}
  `;

  if (date) base = sql`${base} AND m.date::text = ${date}`;

  const matchesRows = await sql`
    ${base}
    ORDER BY m.date DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const matchIds = matchesRows.map((r: any) => r.id);

  const eventsRows = matchIds.length
    ? await sql`
        SELECT me.id,
               me.match_id,
               me.event_type,
               me.minute,
               me.assisting_player_id,
               p.name  AS player_name,
               ap.name AS assisting_player_name
        FROM match_events me
        JOIN players p  ON p.id  = me.player_id
        LEFT JOIN players ap ON ap.id = me.assisting_player_id
        WHERE me.match_id IN ${sql(matchIds)}
        ORDER BY me.minute
      `
    : [];

  const eventsByMatch = eventsRows.reduce((acc: any, e: any) => {
    (acc[e.match_id] ||= []).push({
      id: e.id,
      type: e.event_type,
      minute: e.minute,
      player: { name: e.player_name },
      assisting_player: e.assisting_player_name
        ? { name: e.assisting_player_name }
        : null,
    });
    return acc;
  }, {});

  const data = matchesRows.map((r: any) => ({
    id: r.id,
    date: r.date,
    venue: r.venue,
    score: { home: r.score_home, away: r.score_away },

    competition: {
      id: r.comp_id,
      name: r.comp_name,
      type: r.comp_type,
      season: r.comp_season,
    },

    home_team: {
      id: r.home_team_id,
      name: r.home_team_name,
      short_name: r.home_team_short,
      logo_url: r.home_team_logo,
      country: r.home_team_country,
    },

    away_team: {
      id: r.away_team_id,
      name: r.away_team_name,
      short_name: r.away_team_short,
      logo_url: r.away_team_logo,
      country: r.away_team_country,
    },

    events: eventsByMatch[r.id] || [],
  }));

  return c.json({ page, limit, data });
};
