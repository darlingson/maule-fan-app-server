// src/router/index.ts
import { Hono } from 'hono';
import type { Context } from 'hono';
import { getPlayers, getPlayerById, searchPlayers } from '../controllers/playerController.js';
import { getCompetitions, getCompetitionById, getCompetitionMatches,getCompetitionMatchesEvents } from '../controllers/competitionController.js';
import { getMatches, getMatchById, getMatchEvents } from '../controllers/matchController.js';

const playerRoutes = new Hono()
  .get('/', getPlayers)
  .get('/search', searchPlayers)
  .get('/:id', getPlayerById)
  .post('/', (c: Context) => c.json({ result: 'create a player' }, 201));

const competitionRoutes = new Hono()
  .get('/', getCompetitions)
  .get('/:id', getCompetitionById)
  .get('/:id/matches', getCompetitionMatches)
  .get('/:id/matches/events', getCompetitionMatchesEvents)
  .post('/', (c: Context) => c.json({ result: 'create a competition' }, 201));

const matchRoutes = new Hono()
  .get('/', getMatches)
  .get('/:id', getMatchById)
  .get('/:id/events', getMatchEvents)
  .post('/', (c: Context) => c.json({ result: 'create a match' }, 201));

export { playerRoutes, competitionRoutes, matchRoutes };