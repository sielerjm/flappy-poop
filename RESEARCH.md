# Tester data in education mode

Notice version: `pilot-2` (14 November 2026)

Flappy Poop has a hidden learning mode (📚 education mode) with quiz cards about the gut and its microbes. This page is for invited testers of that mode. It says what the game sends when you join the **tester pilot**, and how to stop.

**No research is being done with this data.** The pilot only tests whether the tools work: whether answers arrive, whether they can be deleted, whether anything breaks. Your answers are not analysed, are not used in any paper, talk or grant text, and are deleted before any later test or study starts. The pilot is not a study and has not been reviewed as one.

## Joining is your choice

- Nothing is sent unless you join. You join in the game: user button → **📚 Education data** → **🔬 Tester data**, with the invite code you were given.
- The pilot is for adults. You tick "I am 18 or older" each time; the game does not remember it.
- You can play education mode without joining. Everything then stays on your device.
- You need no username to join.

## What is sent

One record for each quiz answer you give after joining, in a level break, after a crash, or in the bonus quiz. Answers you gave before joining are not sent. Test-mode runs send nothing.

Each record is stored under a **random id** made by the server. It does not hold your username or your player id.

| Field | What it is |
| --- | --- |
| `event_id`, `session_id`, `run_id` | Random ids for this answer, for the time the game was open, and for the run. They let answers be grouped and stop one answer being stored twice. |
| `card_id`, `card_hash`, `audited`, `deck` | Which card was asked, a fingerprint of its English text, whether that text has been checked, and its section of the gut. |
| `context`, `seq`, `step`, `level` | Where the card came up (a level break, a crash, the bonus quiz), its number in the run, how far into a crash quiz you were, and the level. |
| `order`, `chosen`, `correct` | The order the three answers were shown in, which one you picked, and whether it was right. |
| `rt_ms`, `interrupted` | How long you took, in milliseconds, and whether the time is unreliable (the game was in the background or lost focus, or another card or panel covered the question). |
| `grade`, `reason` | How the game's review schedule rated the answer, and why the card was chosen (new, missed, due for review, or extra practice). |
| `stability`, `difficulty`, `retrievability`, `reps`, `lapses`, `seen`, `since_ms` | What your device knew about this card before the answer: its place in the review schedule (the FSRS scheduler's estimate of how well you know it), how many times you had answered it, and how long ago. |
| `client_at` | Your device's clock when you answered. |
| `app`, `tuning`, `locale`, `field`, `input` | The game version, a fingerprint of its quiz settings, the game's language (a card not yet translated is shown in English), whether the screen was phone-shaped or wide, and whether you used touch, a mouse, keys or a controller. |
| `consent`, `phase` | The version of this notice you agreed to (`pilot-2`) and the phase (`pilot`). |

The server also records when each record arrived.

Not sent with your answers: your username, your scores, or anything about your health or habits. The cards ask about biology, never about you.

Like every website, the database host sees each request's IP address and browser details, which can tell roughly where you are and what kind of device you use. It keeps them in its own logs for a short time, apart from your answers, and they are never stored with them. The exact period will be added here once it is confirmed.

## Who can see it

- Only the game's developer, Michael Sieler, reads it. No other player can see it, and it is not passed on to anyone else.
- It is stored in the game's database, which is hosted by Supabase (a database company).
- The server keeps one more table that links the random id to your player id (the id inside your user code). It is there so that only your devices can add to your answers and delete them. It is readable by the developer only.
- Every device where you load the same user code is the same player, so their answers go under the same random id, and Withdraw on any of them deletes them all.
- With only a few testers, the developer may be able to tell which answers are yours, for example from when you played. Please join only if you are comfortable with that.

## How long it is kept

- Until you withdraw, or until the pilot ends, whichever comes first. When the pilot ends, every participant and every answer is deleted.
- The database host keeps backups for a time. Deleted data can remain in a backup until that backup expires. The exact period will be added here once it is confirmed.

## How to stop

- **Withdraw and delete my data** (user button → 📚 Education data → 🔬 Tester data) deletes your participant record and every answer you sent, at once, and the game stops sending.
- If the game cannot reach the server, it tells you so and you stay joined: try again when you are online.
- **Clear**, in the user panel, makes this device forget its player. It does not delete what was already sent, so withdraw first.
- If you join again later, you get a new random id. Your earlier answers cannot be linked to the new ones.

## Questions and requests

CONTACT TO BE ADDED: an address for questions and for requests about your data will be given here before the invite code goes to any tester.

Until then, please ask the developer in the same way you received your invite.

## Changes to this notice

If what is collected, or why, ever changes, this notice gets a new version and the game asks you again before sending anything under it.

- `pilot-2` (14 November 2026): the game's review schedule changed to FSRS, so the schedule fields are now `stability`, `difficulty` and `retrievability` instead of `ease` and `interval_ms`, and the reasons a card is chosen are new, missed, review or practice.
- `pilot-1` (13 November 2026): the first version.
