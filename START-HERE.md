# START-HERE.md
# Tonight's setup — written for a non-coder

**Time needed:** about 2 hours, most of it waiting
**What you will build tonight:** nothing you can see. Tonight is plumbing. Don't judge progress by what's on screen.
**What you will NOT do:** write code. Not one line.

---

## Your job on this project

You are not the engineer. You have four jobs, and only four:

1. **Approve plans** before agents execute them
2. **Answer business questions** — only you know that a restaurant AMC is 6-weekly
3. **Test on your own phone**
4. **Enforce the Proof-of-Work rule** — never accept "done" without a commit hash

Everything else is delegated. If you find yourself trying to fix code, stop and paste the problem back to the agent instead.

---

# PART 1 — Install (20 minutes)

## Step 1.1 — Install the Claude desktop app

Go to **claude.ai/download** and install it for your computer.

This one app gives you **both** tools you need:
- a **Cowork** section — for documents and data
- a **Code** section — for building the platform

> ✅ **Check:** you can open the app and see both a Cowork area and a Code area.

## Step 1.2 — Create a folder for data

On your computer, make a new folder. Name it exactly:

```
Mumtaz-MOP-Data
```

Put it somewhere you'll find it — your Documents folder is fine.

## Step 1.3 — Put your files in it

Copy into that folder:

- Your Google Sheets exports from the old field ops system (export each sheet as CSV: in Google Sheets → File → Download → Comma Separated Values)
- 3–5 past quotations (PDF or Word, doesn't matter)
- Any chemical or dosage documents you have
- `CONSTITUTION.md` and `CONTEXT.md` — the files I gave you

> ✅ **Check:** open the folder. You should see your CSVs and the two .md files sitting there together.

---

# PART 2 — Start Cowork working (15 minutes)

**Do this before anything else.** Cowork's output feeds Claude Code. If you start Claude Code first, you'll be waiting on data later.

## Step 2.1 — Open Cowork and give it the folder

In the Claude desktop app, open Cowork. Add or mount the `Mumtaz-MOP-Data` folder so it can read it. Cowork can only see folders you explicitly give it.

## Step 2.2 — Paste this exactly

```
Read CONSTITUTION.md in this folder first — it governs this project.

I'm giving you exports from our old field operations system (Google 
Sheets) plus some past quotations. Extract and clean a customer master 
list for our new operations platform. We have around 300 active pest 
control AMC contracts.

For each customer produce: legal entity name, trade name, TRN if 
present, customer type (B2B / B2G / B2C), primary contact name, phone, 
email, emirate, and each physical branch or site with its address and 
any GPS coordinates present.

Rules:
- Do not invent or guess any value. Leave it blank and list it in a 
  "needs confirmation" sheet.
- Flag duplicates and near-duplicates rather than merging them yourself.
- Flag any customer missing a TRN or a legal name in a separate tab — 
  these block UAE e-invoicing compliance and I need to see the size of 
  that problem.

Output one clean CSV per entity type, saved into this folder, plus a 
short summary of data quality: how many records, how many complete, 
what's missing.
```

## Step 2.3 — Read its plan, then let it run

Cowork shows you the steps it intends to take before it starts. **Read them.** That's your cheapest chance to catch a misunderstanding.

⚠️ **Important:** Cowork needs your computer awake and the app open. If the machine sleeps, the task dies. Change your sleep settings before you walk away.

> ✅ **Check:** it's working, and you can see it producing files.

**Leave it running. Move on to Part 3 while it works.**

---

# PART 3 — Create your accounts (30 minutes)

## Step 3.1 — GitHub (where the code lives)

1. Go to **github.com** and sign up (free)
2. Once in, create a **new repository**
3. Name it: `mumtaz-mop`
4. Set it to **Private** — this is your business
5. Tick the option to add a README
6. Create it

> ✅ **Check:** you're looking at a page with `mumtaz-mop` at the top.

## Step 3.2 — Supabase (your database)

1. Go to **supabase.com** and sign up (free)
2. Create a **new project**
3. Name it: `mumtaz-mop-staging`
4. **Region — this is the one decision you cannot undo.** Pick the location closest to the UAE. Mumbai / South Asia is best. Frankfurt / Central Europe if Mumbai isn't offered. **Do not accept a US default.**
5. It will generate a database password — **save it somewhere safe right now.** You cannot retrieve it later.
6. Create, then wait 2–3 minutes for it to finish setting up

> ✅ **Check:** the project shows as active, not "setting up".

## Step 3.3 — Cloudflare (where job photos will live)

1. Go to **cloudflare.com** and sign up (free)
2. Find **R2** in the sidebar
3. Enable it — it will ask for a card, but the free tier is 10 GB and you'll use under 1 GB a year
4. Create a bucket named: `mumtaz-mop-photos`

> ✅ **Check:** you can see an empty bucket named `mumtaz-mop-photos`.

*If R2 asks for something you're not comfortable with, skip it tonight. It isn't needed until Saturday.*

---

# PART 4 — Start Claude Code (30 minutes)

## Step 4.1 — Open the Code section

In the Claude desktop app, open the **Code** area and point it at your `mumtaz-mop` project. If it offers to clone from GitHub, give it the repository you made in Step 3.1.

## Step 4.2 — Add your governing documents

Put these five files into the project folder:

- `CONSTITUTION.md`
- `CONTEXT.md`
- `EXECUTION.md`
- `DECISIONS.md`
- `CLAUDE.md`

Just drag and drop them in. `CLAUDE.md` is the important one — Claude Code reads it automatically every time it starts.

> ✅ **Check:** all five files are visible in the project.

## Step 4.3 — Hand it the setup work

**This is the step that saves you.** You don't install Docker or run commands. You ask it to prepare the environment and approve as it goes.

Paste this:

```
Read CLAUDE.md, CONSTITUTION.md, and DECISIONS.md before doing anything.
They govern this project.

I am not a developer. I will not be writing or editing code. Please set 
up my development environment for me — install what's needed, explain 
each step in plain language before you run it, and tell me clearly 
whenever you need something from me that only I can provide (an account 
login, a password, a decision).

Task K0 — Environment setup:
1. Check what's already installed on this machine and install whatever 
   is missing (Node.js, git, and anything else this project needs).
2. Set up the monorepo structure described in EXECUTION.md task K1.
3. Connect to my Supabase staging project — tell me exactly where to 
   find the connection details and I'll paste them in.
4. Verify everything works and confirm to me in plain language that the 
   environment is ready.

Do not start building the actual platform yet. Setup only. When you're 
done, tell me what you did in language I can understand.
```

## Step 4.4 — What to expect

It will ask permission before running commands. **This is normal and correct — it's supposed to.**

- Read what it's about to do
- If it looks like installing a tool or creating a folder — approve it
- If it wants to delete something or you don't understand it — ask "what does this do and why?" before approving
- If it asks for a password or connection string, that's Step 3.2 — go get it from Supabase

⚠️ **Don't close the window while it's working.**

> ✅ **Check:** it tells you, in plain English, that your environment is ready.

---

# PART 5 — Start the actual build (5 minutes, then wait)

## Step 5.1 — Ask for a plan first

Paste this:

```
Now begin task K1 from EXECUTION.md — the foundations.

Before you write any code, show me your plan in plain language: what 
you're going to build, in what order, and what I'll be able to see when 
it's done. I'll approve before you start.
```

## Step 5.2 — Read the plan

You don't need to understand the technical detail. You're checking three things:

1. Does it mention the **outbox** or **events**? (that's the core of the architecture)
2. Does it mention **migrations**? (it must never edit the database by hand)
3. Does it plan to build **more than tonight's scope**? (if so, tell it to stop at K1)

If it looks right: *"Approved, please proceed."*

## Step 5.3 — Let it work, then demand proof

When it says it's finished, it **must** give you four things:

1. `git diff --stat` output
2. Test results showing a pass
3. A **commit hash** (a string of letters and numbers)
4. Confirmation it pushed to GitHub

**If any of those four are missing, reply:**

```
Per Article X §5 of the constitution, I need the git diff, the test 
output, the commit hash, and confirmation of push before I accept this 
as complete. Please provide all four.
```

This is not bureaucracy. An agent on your previous website project reported work as done that was never committed. This rule is why that won't happen again.

---

# When things go wrong

| What happens | What you do |
|---|---|
| A red error message | Copy **the entire thing** and paste it back with: "This is the error I got. Please fix it." |
| It asks a technical question you can't answer | "I'm not a developer — please make the best choice consistent with CONSTITUTION.md and tell me what you chose and why." |
| It asks a **business** question | **Answer it yourself.** Only you know your pricing, frequencies, and dose rates. If you don't know, say "seed it as ASSUMED and flag it for me to confirm later." |
| It's been silent a long time | Normal. Some steps take 10+ minutes. Leave it. |
| It says something is impossible | Ask: "Is this blocked by CONSTITUTION.md, or is it a technical limitation? What are my options?" |
| You feel lost | Paste: "Explain what you just did in plain language, as if to someone who has never programmed." |

**The single most useful sentence you can send:** *"Explain that to me like I'm not a programmer."* Use it freely. It's not a weakness — it's how you keep control of a project you own.

---

# Tonight's finish line

By the time you go to bed you should have:

- [ ] Claude desktop app installed
- [ ] Cowork working on your customer list
- [ ] GitHub, Supabase, and Cloudflare accounts created
- [ ] Supabase region set correctly (closest to UAE)
- [ ] Five governing documents in the project
- [ ] Claude Code environment ready
- [ ] Task K1 running or complete, with a commit hash

**You will have nothing visual to show. That's correct.** Tonight builds the foundation the other three days stand on. The first thing you'll actually see is Friday, when you activate a contract and twelve months of jobs appear on their own.

---

# Tomorrow (Friday) — a preview

1. Check Cowork's customer CSV. Look at the "needs confirmation" tab — that tells you how bad your current data is.
2. Copy that CSV into the project's `/seed` folder. **This handoff is manual and it's the step people forget.**
3. Give Claude Code task C2's output and task K2 from EXECUTION.md.
4. By Friday night: a contract that generates its own schedule.
