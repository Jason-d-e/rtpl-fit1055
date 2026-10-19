# RTPL: Rider Time Protection Layer

A live teaching prototype for FIT1055 Assignment 2b by T1 Mixue Bingcheng. RTPL is a protection layer around an AI delivery dispatch system: it checks a deadline before the rider and the customer see it, checks the evidence before lateness can count against a rider, and lets an authorised person correct a disputed decision.

**Live demo:** <https://jason-d-e.github.io/rtpl-fit1055/>

## What you see

One website, built to be presented. Each scene matches one slide of the pitch deck, and each press of **→** moves the story one step.

| Scene | Slide | Presenter | What happens on screen |
|---|---|---|---|
| `#slide-2` | 2 | Liyuan Liang | A hand-held phone orders lunch from Noodle Kitchen. The order reaches the AI dispatch, which suggests 12:24; the real trip needs 34 minutes, so 12:24 would mean riding at 120 km/h. |
| `#slide-5` | 5 | Yanyu Zhu | The customer app shows each order step and a checked 12:34. Then: where RTPL sits between the AI dispatch and the apps, reviewer and auditor. |
| `#slide-6` | 6 | Yanyu Zhu | The AI proposes 12:24. RTPL builds a 34-minute legal minimum and publishes 12:34 to both phones. The rider accepts. |
| `#slide-7` | 7 | Yanyu Zhu | A road closure appears on the map. A101 moves to 12:44 and B102 to 12:50. A faster route appears; neither time moves earlier. |
| `#slide-8` | 8 | Yixuan Hu | Case 02. A kitchen delay already extended the deadline. The rider rides to the customer and arrives 12:49: 5 late, 0 new credit, 5 unexplained, protected. |
| `#slide-9` | 9 | Yixuan Hu | Cases 03 and 04 side by side, both 10 minutes late. Incomplete cause record → protected. Reliable rider-cause record → assessment eligible, nothing applied. |
| `#slide-10` | 10 | Shengbao Lu | The rider taps Request human review. Four effects flip to SUSPENDED. An authorised reviewer reverses with a reason; all four become PROTECTED. |
| `#slide-11` | 11 | Shengbao Lu | The minimised oversight record, a who-sees-what table, and the downloadable JSON. |

**Q&A extras** (menu in the top bar): case 07 stale data holds dispatch, case 06 overlapping delays count 10 not 13, case 05 safe legal detour (P05), and a Sandbox for any inputs.

The screen has three parts that always stay in sync:

- **Rider app** (left): order offer, protected deadlines, push notices, the plain-language result and the appeal button.
- **Centre**: a synthetic city map with the rider moving along the route, and the **dispatch console** showing the AI's original number next to the RTPL calculation, with the slide 12 pseudocode filled in with this run's values and the deciding line highlighted.
- **Customer app** (right): only the checked time and delivery status. It never receives evidence, assessments or appeals.

## Presenting

- The page opens on slide 2 and waits on its first frame: the first **→** (or **R**) starts the ordering animation and the music.
- **→**, **Space** or a clicker's next button: next step. **←**: back.
- **2**, **5**–**9**, **0** (slide 10), **1** (slide 11): jump to a slide's scene.
- **R**: restart the scene. **N**: presenter notes (what to point at).
- **Pause** button, **K**, or a clicker's blank-screen button (it sends **B** or **.**): freeze the current animation and music where they are; again to resume. Any step key also resumes.
- **M**: music and sound effects on or off. **L**: looping animations on or off. Music starts after the first key press or click.
- The footer badge shows who is presenting; a name card slides in at each handover.
- Buttons on the phones work too: **Accept order** and **Request human review** advance the story.
- Every step has its own link, for example `#slide-7/2`. Old Case Lab links `#01`–`#07` open the matching scene.
- The page works offline and from `file://`. Map, fonts, rules and data are all local.

### PowerPoint slides inside the page (presenting computer only)

So the whole talk runs in one browser window, the Canva slides can be shown inside the page:

1. In Canva: **Share → See all → Embed → Embed**, and copy the embed link (or the HTML code).
2. On the presenting computer, open the site with `?ppt` at the end of the address (or press **P**), paste the link and press **Save**. Or set it in one click: open the site address followed by `#ppt=` and the link. The part after `#` is never sent to the web server, and the page removes it from the address at once.

The link is saved only in that browser (localStorage). The public site and this repository carry no link, so visitors never see the slides. Edit links are refused, because anyone who saw one could change the slides.

Once saved, a **PPT** button appears (key **P**). The handover cards before PowerPoint-only slides (3–4 and 12–15) become a button, and **→** on those cards opens the slides. The clicker turns the slides; **Back to the website** under the slides continues with the next website scene. Canva links cannot open at a given page, so the slides stay loaded in the background and keep their place. The music is paused while the slides show.

## Scope and evidence boundary

- All orders, routes, AI proposals, delay records and reviewer roles are synthetic. The map is an invented city.
- There is no platform connection, model inference, live GPS, routing service, production authentication or measured rider outcome.
- Numerical settings such as the 48-hour filing window and 24-hour review target are illustrative, not platform policy.
- `ASSESSMENT ELIGIBLE` means an assessment may proceed. It does not mean money, ratings, bonuses or future work have been affected.
- This is an independent coursework prototype, not an official Meituan, Mixue or delivery-platform product.

## Repository structure

| File | Role |
|---|---|
| `rtpl-core.js` | The single executable source for protection rules P01–P07. Unchanged from the version the 42 core tests and the slide notes cite. |
| `app/scenes.js` | Fixed synthetic inputs and every scene/step. All displayed numbers are computed here by `rtpl-core.js`. |
| `app/geo.js` | The synthetic city: streets, places and route paths. |
| `app/render.js` | Pure HTML renderers for the phones, map, console and boards. No policy logic. |
| `app/sound.js` | Music (an opening theme and a main theme) and sound effects, synthesised with the Web Audio API. No audio files. |
| `app/main.js` | Presenter controller: keyboard, links, animation loops, reviewer desk, download, Sandbox. |
| `assets/` | Stylesheet and the two local fonts (Bricolage Grotesque, JetBrains Mono; SIL Open Font Licence). |
| `test/` | Core rule tests, presentation-contract tests and scene/privacy tests. |
| `scripts/browser-check.js` | Real-browser walk-through of the interactive flow. |

## Run the tests

Node.js 18 or later; no install needed:

```text
npm test
```

The browser check needs Playwright: `npm i -D playwright`, then `npm run test:browser` (add a URL to check the deployed site).

## Credits

The two hands on the phone (slides 2 and 5) come from "Dotted background with hands using a mobile phone", [designed by Freepik](https://www.freepik.com/free-vector/dotted-background-with-hands-using-mobile-phone_1072215.htm), used under Freepik's free licence with attribution (credited in the label beside the hands). The shapes are unchanged; `app/render.js` splits the left hand into the parts behind and in front of the phone. Fonts: Bricolage Grotesque and JetBrains Mono (SIL Open Font Licence).
