import { Hono } from 'hono';
import type { Context } from 'hono';
import { getPlayers, getPlayerById, searchPlayers } from '../controllers/playerController.js';

const playerRoutes = new Hono()
  .get('/', getPlayers)
  .get('/search', searchPlayers)
  .get('/:id', getPlayerById)
  .post('/', (c: Context) => c.json({ result: 'create a player' }, 201));

export {playerRoutes};
