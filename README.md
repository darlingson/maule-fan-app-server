```
npm install
npm run dev
```

```
open http://localhost:3000
```

## DATABASE DESIGN
### Tables
#### teams
- id (PK)
- name
- short_name
- logo_url
- country

#### competitions
- id (PK)
- name (e.g., Super League Malawi)
- type (league, cup, friendly)
- season (e.g., 2025/26)

#### matches
- id (PK)
- competition_id (FK)
- date
- home_team_id (FK)
- away_team_id (FK)
- score_home
- score_away
- venue (optional)

#### players
- id (PK)
- name
- short_name
- date_of_birth
- nationality
- photo_url
- position

#### player_team_history
- id (PK)
- player_id (FK)
- team_id (FK)
- start_date
- end_date

#### match_events
- id (PK)
- match_id (FK)
- player_id (FK)
- event_type (goal, yellow_card, red_card)
- minute
- assisting_player_id