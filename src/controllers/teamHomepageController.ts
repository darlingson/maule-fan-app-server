import type { Context } from 'hono';
import { sql } from '../services/db.js';

interface MatchEvent {
  event_type: 'goal' | 'corner';
  minute: number;
  player_name: string;
  assist_name: string | null;
}


export const getTeamHomepage = async (c: Context) => {
  const teamId = c.req.param('id');

  /* 1.  Latest finished match involving this team */
  const [latestMatch] = await sql`
    SELECT m.id,
           m.date,
           m.venue,
           m.score_home,
           m.score_away,
           ht.id   AS home_id,
           ht.name AS home_name,
           at.id   AS away_id,
           at.name AS away_name
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE (m.home_team_id = ${teamId} OR m.away_team_id = ${teamId})
      AND m.score_home IS NOT NULL          -- considered “finished”
    ORDER BY m.date DESC
    LIMIT 1`;

  let latestEvents: MatchEvent[] = [];
  if (latestMatch) {
    latestEvents = await sql`
      SELECT e.event_type,
             e.minute,
             p.name  AS player_name,
             ap.name AS assist_name
      FROM match_events e
      JOIN players p ON p.id = e.player_id
      LEFT JOIN players ap ON ap.id = e.assisting_player_id
      WHERE e.match_id = ${latestMatch.id}
        AND e.event_type IN ('goal','corner')
      ORDER BY e.minute`;
  }

  /* 2.  Next upcoming match */
  const [nextMatch] = await sql`
    SELECT m.id,
           m.date,
           m.venue,
           ht.id   AS home_id,
           ht.name AS home_name,
           at.id   AS away_id,
           at.name AS away_name
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE (m.home_team_id = ${teamId} OR m.away_team_id = ${teamId})
      AND m.score_home IS NULL
    ORDER BY m.date ASC
    LIMIT 1`;

  let kickoffIn = null;
  if (nextMatch) {
    const diff = new Date(nextMatch.date).getTime() - Date.now();
    const days = Math.floor(diff / 86_400_000);
    const hours = Math.floor((diff % 86_400_000) / 3_600_000);
    kickoffIn = `${days}d ${hours}h`;
  }

  /* 3.  Competitions the team is part of this season */
  const competitions = await sql`
    SELECT DISTINCT c.id, c.name, c.type, c.season
    FROM matches m
    JOIN competitions c ON c.id = m.competition_id
    WHERE (m.home_team_id = ${teamId} OR m.away_team_id = ${teamId})
      AND c.season = '2025/26'
    ORDER BY c.name`;

  return c.json({
    latest: latestMatch
      ? {
          ...latestMatch,
          events: latestEvents,
        }
      : null,
    next: nextMatch
      ? {
          ...nextMatch,
          kickoffIn,
        }
      : null,
    competitions,
  });
};