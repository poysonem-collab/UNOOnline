# UNO Online

Play UNO in the browser against bots, and soon online with friends (up to 10 players).

## Play it

**Online:** once GitHub Pages is turned on (see below), the game is at
`https://<your-github-name>.github.io/uno-online/`.

**On your own computer:**

1. Install [Node.js](https://nodejs.org) 22 or newer.
2. Download this repo (green **Code** button → **Download ZIP**, then unzip it), or `git clone` it.
3. In a terminal, inside the folder:
   ```
   npm install
   npm run dev
   ```
4. Open the address it prints, usually http://localhost:5173.

To try it on your phone on the same Wi-Fi, run `npm run dev -- --host` and open the
"Network" address it prints.

Add `?cards` to the address to see every card design.

## Turning on the online link (GitHub Pages)

1. In the repo on GitHub: **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Every push to `main` then tests, builds and publishes the game (see the **Actions** tab).

On a free GitHub account, Pages only works for **public** repos.

## Project layout

| Folder | What's in it |
|---|---|
| `packages/shared` | Game rules, deck, bots — used by both the browser and (soon) the server |
| `packages/client` | The website (React) |

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Run the game locally with live reload |
| `npm test` | Run the rules and bot tests (includes 1,000 simulated games) |
| `npm run typecheck` | Check types |
| `npm run build` | Build the website into `packages/client/dist` |

## Status

- [x] Step 1 — Rules engine with tests
- [x] Step 2 — Play against bots in the browser
- [ ] Step 3 — Lobby with room codes and host rules
- [ ] Step 4 — Online multiplayer
- [ ] Step 5 — House rules (stacking, 7-0, jump-in, draw until playable)
- [ ] Step 6 — Polish: sounds, turn timer, scoreboard
- [ ] Step 7 — Deploy the multiplayer server

UNO is a trademark of Mattel. This is an unofficial fan project; the card art is drawn from scratch.
