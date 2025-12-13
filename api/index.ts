import { handle } from 'hono/vercel';
import { Hono } from 'hono';

import { playerRoutes, competitionRoutes, matchRoutes, teamRoutes } from '../src/router/index.js';

const app = new Hono()
  .route('/api/players', playerRoutes)
  .route('/api/competitions', competitionRoutes)
  .route('/api/matches', matchRoutes)
  .route('/api/teams', teamRoutes)
  .get('/', (c) => c.text('Hello Hono!'));

export default handle(app);