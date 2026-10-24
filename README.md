# UNO Online

Play UNO in the browser against bots, or online with friends (up to 10 players, humans and bots mixed).

## Play it

**https://unoonline-y7vw.onrender.com/** (the game server on Render; everything works here)

**https://poysonem-collab.github.io/UNOOnline/** (a copy on GitHub Pages that connects to the same server)

The Render server falls asleep when nobody has used it for 15 minutes, so the first visit after that
takes up to a minute.

## House rules

The host can switch these on in the lobby (or on the setup screen for bot games):

| Rule | What it does |
|---|---|
| Stack +2 / +4 | Hit with a draw card? Play your own to pass the total on. Optional: allow a +2 on a +4 (in the +4's color). |
| Stack same numbers | Play several cards of the same number at once, in any colors. The last one sets the color. |
| 7-0 | A 7 swaps hands with a player you choose; a 0 passes every hand along. |
| Jump-in | Hold the exact same card as the top one? Play it any time, even out of turn. |
| Draw until playable | Keep drawing until you get a card you can play. |
| Challenge Wild +4 | The official rule: a +4 is only allowed with no card of the current color. The next player can challenge. A bluffer draws 4; otherwise the challenger draws 6. |
| No finishing on action cards | Your last card has to be a number card. |

## Run it on your own computer

1. Install [Node.js](https://nodejs.org) 22 or newer.
2. Download this repo (green **Code** button → **Download ZIP**, then unzip it), or `git clone` it.
3. In a terminal, inside the folder:
   ```
   npm install
   npm run dev
   ```
4. Open http://localhost:5173. This starts both the website and the game server.

To play with people on the same Wi-Fi, run `npm run dev -- --host` instead. Then they open the
"Network" address it prints (e.g. `http://192.168.1.20:5173`).

Add `?cards` to the address to see every card design.

## Put it online with Render

[Render](https://render.com) runs the game server for free, and the server also serves the website,
so one link does everything.

1. Sign up at https://render.com (signing in with GitHub is easiest).
2. Click **New → Blueprint**, pick the **UNOOnline** repo, and click **Apply**.
   Render reads `render.yaml` and sets everything up.
3. When the deploy finishes (a few minutes), your game is at the address Render shows,
   something like `https://unoonline.onrender.com`. Share that with friends.

Render redeploys automatically on every push to `main`.

How online games handle problems:

- **Refresh or dropped connection:** you rejoin automatically, with your cards. If you're gone for
  more than 20 seconds, a bot plays your turns until you're back.
- **Leaving mid-game:** a bot takes over your seat for the rest of the game.
- **Turn timer:** when it runs out, you draw a card and play moves on.
- **Everyone leaves:** the room closes 5 minutes after the last person disconnects.

On the free plan the server falls asleep after 15 minutes without visitors. The next visit wakes it
up, which takes up to a minute. Rooms only live in memory, so a restart or redeploy closes open rooms.

## Turning on the GitHub Pages copy

1. In the repo on GitHub: **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Every push to `main` then tests, builds and publishes the site (see the **Actions** tab).

The Pages copy talks to the server set by `VITE_SERVER_URL` in `.github/workflows/deploy.yml`.
That server must list the Pages address in its `CORS_ORIGINS` setting (see `render.yaml`).

## Project layout

| Folder | What's in it |
|---|---|
| `packages/shared` | Game rules, deck, bots, and the messages between browser and server |
| `packages/client` | The website (React) |
| `packages/server` | The game server (Node.js + Socket.IO): rooms, lobbies and online games |

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Run the website and game server locally with live reload |
| `npm test` | Run all tests (rules, bots, 1,000 simulated games, lobby server) |
| `npm run typecheck` | Check types |
| `npm run build` | Build the website and server |
| `npm start` | Run the built server (serves the website too) on port 3001, or `$PORT` |

## Status

- [x] Step 1: Rules engine with tests
- [x] Step 2: Play against bots in the browser
- [x] Step 3: Lobby with room codes, invite links and host rules
- [x] Step 4: Online games (friends and bots together, turn timer, rejoin after refresh)
- [x] Step 5: House rules (stacking, same numbers, 7-0, jump-in, draw until playable, +4 challenge, no action finish)
- [x] Step 6: Polish (sound effects with a mute button, flying-card animations, big callouts, confetti, end-of-round breakdown and scoreboard)
- [ ] Step 7: Hosting polish

UNO is a trademark of Mattel. This is an unofficial fan project; the card art is drawn from scratch.
