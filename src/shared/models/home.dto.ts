export interface HomeCompetitionDto {
  id:          number;
  name:        string;
  type:        'league' | 'cup' | 'friendly';
  season:      string;
}

export interface HomeTeamDto {
  id:         number;
  name:       string;
  shortName:  string;
  logoUrl:    string | null;
}

export interface HomeMatchDto {
  id:            number;
  date:          string;
  competition:   HomeCompetitionDto;
  homeTeam:      HomeTeamDto;
  awayTeam:      HomeTeamDto;
  scoreHome:     number | null;
  scoreAway:     number | null;
  venue:         string | null;
}