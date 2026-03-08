# Strategy Tab & API Data Ideas

## 1. Other data from the API we could show

### Already in use
- **War points / fame** – weekly total per player
- **Decks used** – battles played per week
- **Boat attacks** – stored in DB (`war_participants.boat_attacks`) and in participant `raw_data`; not yet shown in the main table
- **Trophies** – stored per participant; could show current or weekly snapshot
- **Rank** – in-war rank per week
- **Join date / “how long ago they joined”** – from our `member_history` (firstSeen), shown as tooltip on NEW badge

### Available from our pipeline / API and easy to expose
- **Boat attacks** – We have `boatAttacks` in participant data. Could add a column “Boat” or “Boat attacks” next to points, or show in a tooltip.
- **Decks used** – We already use it; could show in the table as a small column (e.g. “Decks”) for each week.
- **Trophies** – In `war_participants` and raw_data. Could show “Trophies” in Players tab or in a weekly column.
- **Clan total points per week** – Sum of all participants; could show in Summary or in a small “Clan total” row/header.

### From the official Clash Royale clan endpoint (member list)
The clan endpoint we call returns a **member list** with fields we may not yet pass through or display:
- **expLevel** – player level
- **donations** / **donationsReceived** – if the API returns them (verify in your API response)
- **role** – already used (leader, co-leader, elder, member)

Worth checking the actual JSON from `GET /v1/clans/%23{tag}` and adding any of these to the member object we send to the frontend so we can show “Level”, “Donations”, etc. in the Players tab or in the table.

### From river race / war log (participant level)
- **fame** / **warPoints** – already used
- **decksUsed** / **battlesPlayed** – already used
- **boatAttacks** – available; not yet in the UI
- **name**, **tag**, **rank** – already used

Anything else in the participant object (e.g. in `raw_data`) is worth a one-time log of a real API response so we can list every field and decide what to show.

---

## 2. Strategy tab: what we could do

### Already on Summary
- **Momentum** – total points vs 180k possible and 80k minimum; points needed to bring everyone to 1600.

### Ideas that work with data we have (or can add)

1. **Duels vs boat attacks vs “battles”**
   - We have **decks used** (battles) and **boat attacks** per player per week.
   - We could:
     - Add a **Strategy** sub-section or card: “Points per deck” (total war points ÷ total decks used) for the clan or per player.
     - Show **boat attacks** in the table or Summary and compare “points from boat” vs “points from battles” if the API ever splits them (currently we have total points and counts).
   - **Chart:** Bar or line of “avg points per deck” by week or by player.

2. **Best “time” to battle**
   - The API does **not** give per-battle timestamps; we only have weekly aggregates (points, decks used) per war week.
   - So we **cannot** compute “you make more points when you battle at 8pm” from current data.
   - To do that we’d need either:
     - Timestamped battle data from another source (e.g. RoyaleAPI or a proxy that logs time-of-day), or
     - Manual input (e.g. “I battled mostly in the evening this week”).

3. **Easiest matchup / matchup tips**
   - Matchups are **clan vs clan**; the API gives our clan’s participants and totals, not the opponent’s deck or roster.
   - We **cannot** see “which opponent deck is weakest” or “easiest matchup” from official API data alone.
   - We could:
     - Show **our** clan’s strength (e.g. total points, participation rate) and suggest “aim for 1600 to carry your weight” as we already do.
     - If you ever have a separate source of matchup or opponent data, we could add a “Matchup” section later.

4. **Points by activity type (when possible)**
   - If the API or our DB ever provides a split (e.g. points from duels vs from boat), we could add:
     - “Points from duels vs boat attacks” chart.
     - “Focus on duels vs boat” recommendation based on which gives better points per battle for your clan.

5. **Participation and consistency**
   - We already have participation rate and “on track / nudge / at risk.”
   - Strategy tab could add:
     - **Charts:** Participation rate over time; distribution of points (e.g. how many at 1600+, 800–1599, &lt;800).
     - **Streaks:** “Weeks at 1600+” or “Weeks below 800” for motivation.

6. **Top contributors and “efficiency”**
   - **Leaderboard** (e.g. last 3 months) – already on Players tab.
   - **Efficiency:** “Points per deck” leaderboard (who gets the most war points per battle). Requires decks-used data we already have.

### Suggested next steps for a Strategy tab
- Add a **Strategy** tab (or expand the Summary “Strategy” card) with:
  - **Points per deck** – clan average and top players (using war points and decks used).
  - **Boat attacks** – total or average per week if we add boat data to the UI.
  - **Participation over time** – simple line or bar chart (e.g. last 12 weeks).
- Keep “best time to battle” and “easiest matchup” as **future ideas** unless we get new data sources.

---

## 3. Quick reference: where things live

| Data              | Source                    | In UI? |
|-------------------|---------------------------|--------|
| War points        | war_participants / API    | Yes (table) |
| Decks used        | war_participants / API    | In data; optional column |
| Boat attacks      | war_participants / API    | In data; not in table |
| Trophies          | war_participants / API    | Stored; not in table |
| Join date         | member_history (firstSeen)| Yes (NEW tooltip) |
| Level (expLevel)  | Clan API member list      | Check API; not yet |
| Donations         | Clan API member list      | Check API; not yet |

Adding a **Strategy** tab with charts (e.g. points-per-deck, participation over time) and optional columns (boat attacks, decks) will give the most value with the data we already have.
