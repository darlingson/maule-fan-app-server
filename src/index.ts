import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { sql } from '../src/services/db.js';
import { appAuth } from './middleware/AppAuth.js';
import { playerRoutes } from './router/index.js'
const app = new Hono()

app.route('/api/players', playerRoutes);

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/api/teams', async (c) => {
  console.log("endpoint hit")
  const teams = await sql`SELECT id, name, short_name FROM teams ORDER BY name`;
  return c.json(teams);
});
app.get('/api/secure/path', appAuth(), (c) => {
  return c.text('Hello Secure path!')
})

serve({
  fetch: app.fetch,
  port: 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
