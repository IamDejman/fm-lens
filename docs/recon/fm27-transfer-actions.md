# FM27 transfer, loan, release and job actions

Build 26340721, macOS ARM64 slice. All addresses are RVAs (game_plugin+0xRVA). Static analysis only:
nothing here was run in the game. Every signature below is read from disassembly and must be proven on
the running game before FM Lens relies on it. Scratch helpers live in
reports/batch/scratch/transfers/.

Later findings in fm27-call-shapes.md supersede the "not found" rows below: loan recall and release go through
0x2d4b9dc (section 4 there), future transfers through 0x2dfedac with a 'TrDt' date (section 5).

## Summary

| Item | Status | Entry point |
| --- | --- | --- |
| 1 Permanent transfer with fee | partial | 0x2dfedac (TRANSFER_MANAGER), fee key 'TrFe' |
| 2 Loan start | partial | 0x2e0a324 (StartLoan), built by 0x238d860 |
| 2 Loan recall, early end, expiry | not found | only UI checks found |
| 3 Free agent signing | partial | same call 0x2dfedac, free-agent club as target (unproven) |
| 4 Release, mutual termination | not found | UI validation only |
| 5 Staff move | found | 0x238cac8 -> 0x2d49334 |
| 5 Human manager job | partial | 0x553ec8 UI handler; executor not traced |
| 6 Future transfers, instalments, buy-back, sell-on | partial | stored by STARTING_* classes at new game; runtime store not found |
| 7 Feasibility | assessed | in-process main-queue dispatch |

## Correction to fm27-human-manager.md

The "handler around 0x238DDBC" that note describes is IGE analytics. The functions near it
(0x238da74, 0x238c470, 0x238d44c) only send telemetry. The real mover is 0x2dfedac, reached from 0x238c860.

## The in-game editor (IGE) move path (this is what the editor UI runs)

Call chain, all on the UI thread:

1. 0x25cd08: IGE request handler. Builds the terms map from the dialog and dispatches by action.
2. 0x25e8c0: wrapper. If source and destination match it tail-calls 0x238d7d8, else 0x238c1ec.
3. 0x238c1ec: routes. Players (person byte [person+0x2f] == 0) go to 0x238c860 after the acceptance
   check 0x226f140. Non-players go to 0x238cac8. Sends a telemetry event (key 'CTst') on the way.
4. 0x238c860(x0 = IGE object, x1 = destination team, x2 = person, x3 = terms map). Calls
   0x2dfedac(TRANSFER_MANAGER, x1, x2, x3, out[3 qwords zeroed], w5 = 0). On success it calls the GAME_UI
   refresh at vtable slot +0x1b8 of the object at game_plugin+0x56d48b8.

TRANSFER_MANAGER singleton: the pointer sits at game_plugin+0x56a49f8 (RTTI MANUAL_SINGLETON of
TRANSFER_MANAGER, vtable 0x55f9988).

## 1. Permanent transfer with a fee

Status: partial. Entry point and term keys found. Which of its callees writes the history record, the
finances and the news was not isolated.

Where: 0x2dfedac, about 0x1914 bytes, a TRANSFER_MANAGER method.
Signature (from the prologue and both callers):

- x0 = TRANSFER_MANAGER* (the pointer in the slot at +0x56a49f8).
- x1 = destination TEAM (club) object. The IGE passes the object it received; the other caller gets it from
  vtable slot +0x6d8 of a second object.
- x2 = PERSON* (player or non-player).
- x3 = pointer to the terms map, a property map keyed by 4-char codes (values are boxed ints, bytes, bools
  or dates, built with 0x4403ec0, 0x4403e8c, 0x4403ef4).
- x4 = pointer to a 24-byte out struct, zeroed by the caller.
- w5 = 0 from the IGE path, 1 from the offer path (0x2dfeb00).
- Returns w0, nonzero on success.

Terms keys the IGE form sets (0x25d66c to 0x25d82c). Meanings inferred from the form fields, not proven:

| Key | Value | Likely meaning |
| --- | --- | --- |
| 'TrFe' | int | transfer fee |
| 'TrDt' | date | transfer date (current date copied via 0x42f05b8) |
| 'ArFR' | byte flag | form option, unknown |
| 'PoNs' | signed byte | form option, unknown |
| 'PpNs' | signed byte | form option, unknown |
| 'BuBP' | int | buy-back price (class PLAYER_BUY_BACK_INFO exists) |
| 'StWC' | signed byte | form option, unknown (a sell-on or wage clause) |
| 'Pcjo' | bool | contract joined flag, set when the player is not already in the squad |

What 0x2dfedac does, in order (from the call list):

- Prepares the destination: 0x2d4b9dc(this, team ...) and 0x2d4f79c(this, team, 1, ...), the same pair used by the
  low-level mover below. Also 0x263905c on the global at +0x56a64c8 and a loop over the list at +0x56a6890
  calling 0x26198e0.
- Reads the fee term, then calls 0x1831b5c with the person (an offer builder in the TRANSFER_OFFER area).
- Reads 'ArFR', 'BuBP', 'StWC', 'PoNs', 'Pcjo' and 'Ttea' from the map.
- Calls the low-level mover 0x2d49334 for the player twice (0x2dffb58, 0x2dffc60), the second for the loan or
  trial variant. For non-players it calls 0x2798880 (type 5, flag 0x15).
- Late calls: 0x2d56d5c, 0x2d5701c, 0x2d12154, 0x2dbbb48, 0x26004ac, 0x2d91328, 0x2d91b20, 0x1007e5c, 0xcbe8e4,
  0x1830c18. The strings "FULL_TRANSFER_OFFER", "FULL_CONTRACT" and "CONTRACT_OFFER" are used there, which
  means it builds a contract offer and a full contract itself.

Low-level mover: 0x2d49334(x0 = TRANSFER_MANAGER*, x1 = team, x2 = person, w3 = move kind, w4, w5, w6, w7, stack
byte, stack qword). Both the editor path and the staff path call it with w3 = 0, w4 = 1, the rest 0, stack byte
1, stack qword 0. It has 50 callers (retirements, regens, loans, staff). It is the common "put this person on
this team" function.

Evidence: disassembly at 0x238c860, 0x2dfeb00 and 0x2dffb1c. Not run.

Editing: raw writes (transfer.rs) bypass the contract, history and finance work above. Call 0x2dfedac.

Values to check in FM: move a player with FM's own IGE dialog, then read the club "Transfer History" and the
player's "Career history" for the fee row.

## 2. Loans

Status: start partial, recall and expiry not found.

Start: 0x2e0a324(x0 = TRANSFER_MANAGER*, x1 = STARTING_LOAN*, w2 = bool). It reads the loan object (player
pointer at +0x18, flags byte +0x54), then makes the loan contract through 0x2e0c240 and 0x2e0cc78. It is also
called from 0x2e09d6c, the new-game processor path, and from 0x238d860 (IGE).

STARTING_LOAN is a property-bag stack object, vtable 0x55be9d8. Slot +0x10 is the setter(this, key, value). The
IGE builder 0x238d860(x0 = IGE object, x1 = team, x2 = person, x3 = vector of 16-byte (u32 key, value) entries)
fills it and calls 0x238da74 (telemetry) and 0x2e0a324. Keys set in the form (0x25d04c to 0x25d3c4): 'PLcl',
'PLsd', 'PLed', 'PLbr', 'PLAT', 'PLct', 'PLcr', 'PLcm', 'PLmc', 'PLoc', 'PLob', 'PLic', 'PLAC', 'PLsn', 'Pfbb',
'PLmf', 'PLwc', 'PLfb', 'PLNG'. Guessed meanings: start date, end date, break clause, wage share, recall,
option to buy. Not proven.

Contracts: the factory is 0xfeca24 (types 0 to 5: FULL, B_CLUB, TRIAL, BASIC, LOAN, YOUTH_TRIAL, FULL_CONTRACT
vtable 0x55abd68). Contract layout is in fm27-club-extras.md section 5.

Recall: the actions RECALL_FROM_LOAN, PLAYER_REMOVE_FROM_LOAN_LIST and the setting names
"loan_players_can_be_recalled" and "loan_players_can_have_loans_terminated" exist. Their server UI handlers
(vtable slot 7: 0x342150 for recall) only validate and build analytics. The function that ends a loan was not found.
Expiry: not found. Plausibly a daily-update routine that reads the end date at contract +0x48.

## 3. Free agent signing

Status: partial. No dedicated function found. The IGE has a string "IGEHumanMangagerMoveToInactiveClub"
(0x25d88c), which suggests a free agent is moved with the same 0x2dfedac call with a free-agent or inactive
club as destination. Unproven. The offer path (0x2dfeb00 -> 0x2dfedac with w5 = 1) is the one the
negotiation UI uses.

## 4. Release and mutual termination

Status: not found.

Seen: client actions RELEASE_FROM_CLUB_CONTRACT_ACTION, PERSON_MUTUAL_TERMINATION_CONTRACT, SET_FOR_RELEASE,
PERSON_TERMINATE_CONTRACT, with RTTI classes RELEASE_FROM_CLUB_CONTRACT_RESPONSE_OBJECT and RELEASED_PLAYER_WAGES.
Their server UI handlers (0x33bd7c mutual termination, 0x33d180 set for release) only validate (calls to
0x2619b40, 0x261bd84, 0xfef1a4). The payoff routine that creates RELEASED_PLAYER_WAGES was not traced.

Plan: trace from the vtable of RELEASED_PLAYER_WAGES to its constructor callers, then to the caller that also
clears the contract at person +0x2F0.

## 5. Staff moves and the human manager

Staff move: found. 0x238c1ec routes non-players to 0x238cac8. It builds a CONTRACT_OFFER and calls
0xcb7108, 0xcb7738, then 0x2d49334(TRANSFER_MANAGER, team, person, 0, 1, 0, 0, 0, stack byte 1, qword 0)
when the move kind is 0x14, and 0x2798880 otherwise. 0x2798880(x0 = global at +0x56b51d8, x1 = team, x2 =
person, w3 = 5, w4 = 0x15, x5 to x7 = 0) is the non-player appointment (6 callers). Evidence: 0x238d02c and
0x2dffc98 call sites.

Human manager and national jobs: partial. Client actions TEAM_CONTAINER_APPLY_FOR_JOB, TEAM_APPLY_FOR_JOB,
PERSON_APPLY_FOR_ALL_JOBS and OFFER_STAFF_NATIONAL_JOB exist. Their server UI handlers (0x553ec8, 0x33ccec) validate
and call 0x2793..0x2790 helpers and 0x22934d4. The appointment that changes the human manager's club was not
traced. The singleton JOB_CENTRE_MANAGER has vtable 0x55f66d0. The safest FM Lens route for the human manager
is the IGE mover path above, which already handles non-players.

## 6. Future transfers, instalments, buy-back, sell-on

Status: partial.

Seen: new-game starting data classes STARTING_FUTURE_TRANSFER, STARTING_MONTHLY_INSTALLMENT,
STARTING_PAST_TRANSFER, processed by 0x2e06220 (callers: 0x251c850). Past-transfer code is at 0x2e0d4b0 and
0x2e20518. Runtime classes TRANSFER_INFO, EXTRA_TRANSFER_PAYMENT_INFO and PLAYER_BUY_BACK_INFO exist. The
client action PLAYER_CANCEL_FUTURE_TRANSFER and the strings "cancel_future_transfer" and "terminate_contract"
are UI only.

Not found: where an agreed future transfer lives on a player or club, and which function cancels it. The editor
fields 'BuBP' and 'StWC' in the terms map suggest buy-back and sell-on are attached at transfer time.

## 7. Can FM Lens invoke these?

Pointer authentication: no. The slice is cpusubtype ARM64 ALL (not arm64e). A grep of the 370 MB disassembly for
paciasp and pacibsp found zero hits, and no autiasp, retab or blraa. Function pointers can be called as plain
AAPCS64 addresses.

(a) In-process main-queue dispatch is the recommended route. The bridge dylib already runs inside FM through
DYLD_INSERT_LIBRARIES. The game links AppKit and CoreFoundation, so the main queue is served by the main run
loop. The bridge can call dispatch_async_f(dispatch_get_main_queue(), ctx, fn) and run the call in fn, with the
function address game_plugin base plus RVA (base from the image list or from the task port the editor already
has). The IGE UI handler itself runs on the main thread, so this matches the context FM expects. No thread
hijack is needed, and nothing needs patching.

(b) Thread hijack through the task port is not advised. It needs a suspended thread, a hand-built stack and
exact register setup, and can race FM's own state. The Rust bridge also has no code to receive an address and
arguments yet; it must add a command to its Mach service, which would be the first game-executing code in it.

Argument objects: no simple (player, club, fee) entry point exists. 0x2dfedac needs the terms map in FM's own
format (keys and boxed values built with FM helpers 0x43f72e4, 0x4403ec0, 0x4403e8c, 0x4403ef4). The simplest
safe plan is to call those same helpers from the bridge to build the map, exactly as 0x25d66c does, so the
layout is FM's own. The person and team arguments are the ordinary object pointers FM Lens already holds. The
team object passed in may be adjusted by a vtable thunk: the IGE passes the object itself.

Safe state: use the paused game on a non-match day (the career sits on a match day today, which is not a safe
point), with the IGE (editor) mode active and no dialog open. Avoid calls during day processing or a match.

Plan to prove it, needs the user:

1. With the screen, perform one IGE move on a throwaway player and compare against the output of a call made
   from a test bridge command.
2. Prove the signature first with a harmless pair: the same club to the same club must be refused by the
   acceptance check 0x226f140.
3. Then move one player with a fee and read the club transfer history.

## What needs the screen

- One real IGE transfer with a fee to confirm the 'TrFe' and 'TrDt' term meanings.
- One real loan to confirm the 'PL' keys.
- One real release, to find the termination path by watching which pointer changes (read only).
