# FM27 recon: moving the human manager (club, national, leave job)

Build: Steam 26340721, macOS arm64, game_plugin UUID F4540355-2186-39CB-9119-C706A6A35346.
Method: static only. All addresses are RVAs (file offset equals RVA for text).
Nothing here was run against the game.

## 1. Status

| Item | Status | Confidence |
|---|---|---|
| Editor action to move to a club (PERSON_CHANGE_HUMAN_TEAM) | Chain traced to the engine call | Medium |
| Editor action to take a national job (MOVE_TO_MY_NATIONAL_TEAM / OFFER_STAFF_NATIONAL_JOB) | Chain traced to 0x238cac8; OFFER handler 0x33ccec not traced | Medium-low |
| Leave a job (terminate_contract handler 0x238eafc; RESIGN 0x33f5dc not traced) | Traced to 0x2d4b9dc plus 0x2798880 | Medium |
| Direct bridge call of club move (0x2dfedac) | Plausible, FM Lens already calls it for sign_free_agent | Medium |
| Direct bridge call of national move | Blocked: needs an IGE edit-session object | Low |
| Club job plus national job together | Plausible (separate contract slots), unproven | Low |
| Undo | Reasoned, not traced | Medium-low |

## 2. Handler table (server UI-handler vtable, slot +0x38)

Signature (this, w1 = 0x2c, map). Gated on the byte at 0x56d4920+0x7f.
Maps are vectors of 16-byte entries {u32 FourCC key, Value*}; a missing key reads the default holder at 0x56d63c0.

| Action | Server vtable | Handler | Chain |
|---|---|---|---|
| PERSON_CHANGE_HUMAN_TEAM | 0x54da518 | 0x347460 | IGE person-move 0x238c1ec |
| RESIGN | 0x54d86a0 | 0x33f5dc | not traced |
| OFFER_STAFF_NATIONAL_JOB | 0x54d7e30 | 0x33ccec | not traced |
| BECOME_UNSACKABLE | 0x54d9b40 | 0x346114 -> 0x238a164 | unrelated |
| terminate_contract | (see 0x238eafc) | 0x238eafc | map{'dreL'}, w1 = 0 club or 1 nation |

Action classes: MOVE_TO_OTHER_TEAM_ACTION 0x55d00a0, MOVE_TO_MY_NATIONAL_TEAM_ACTION 0x55d02c0, CHANGE_HUMAN_TEAM_ACTION 0x55ce0a0, HUMAN_CLUB_RESIGN_ACTION 0x55d4398.
The "handler around 0x238DDBC-0x238DF40" in fm27-human-manager.md is analytics logging, not the move.

## 3. Final signatures

Map keys (FourCC, high byte first): 'Ttea' 0x54746561 (target team ref), 'Pcjo' 0x6a6f5063 (job code), 'dref' 0x64726566, 'dreL' 0x6472654c (list of person refs), 'tick' 0x7469636b.
Packed refs are type<<24 | id; a team is 0x18<<24 | id.
Job codes: 16 and 17 Manager, 20 and 21 Assistant Manager.

### 3.1 Move to a club

Editor: 0x238c1ec(IGE, person block, team, map). Kind 0 (club): human precheck 0x226f140 at 0x238c3f4, then 0x238c860 at 0x238c448.
0x238c860: logger 0x238da74(IGE, person, team, w3 = 6 or 1), then at 0x238c920:

    0x2dfedac(TM, person block, team, map, &outvec, 0)

- TM = [0x56a49f8]; person block is the human's identity block at object+0x548; team is the club team object.
- map: 'Pcjo' = 16 (Manager), optionally 'Ttea'.
- Already called by FM Lens' sign_free_agent with a plain map and out vector, so the bridge shape exists.
- Manager branch: the existing manager at team+0x80 is dismissed via 0x2798880(M, mgr, team, 5, 0x15, ...) at 0x2dffc98 when team+0x28 is zero. M = [0x56b51d8]. The appointment goes through 0x27a103c, then post-appointment events 0x1b95ec0.
- The human's own prior contract is ended in the 0x2dfee3c prologue.
- Contract creation: factory [0x56d2c88] vt[0x38] at 0x2dffe50 (w4 = 0x40, team passed via the stack struct, x3 = club at team+0x30).

### 3.2 Move to a national team

Editor: 0x238c1ec kind 1 branches at 0x238c2b8..0x238c2d4 to 0x238cac8(IGE, person, team, map).
0x238cac8 handles only the national contract (vslot 0x3d0), not the club contract (vslot 0x3a0), so a club plus national job is structurally possible. It reads the IGE object's vslots (logger), so it is not callable from the bridge without a live edit session.
Candidate alternative: 0x2dfedac with a national team (team+0x2f = 1). Unproven; team+0x28 (0x100 marks national in fm27-nations.md) may skip the dismissal at 0x2dffc98.
National manager slot is team+0x80.

### 3.3 Leave a job

Editor: 0x238eafc(map{'dreL' = list of person refs}, w1 = 0 club or 1 nation).
Primitives: end contract 0x2d4b9dc(TM, ident, contract, 0, 0, 1, 0, 0, 0, 0), then vacate the manager slot via 0x2798880.
Not traced: RESIGN 0x33f5dc, 0x2d49334 leave semantics for the human, 0x2d56d5c, 0x2d5701c, 0xcb7108.

## 4. Preconditions

- Club move: club needs no vacancy; the sitting manager is dismissed by the game. The human's current club contract is ended first. A newly created contract is registered with the job-event system ([0x56d57d0]->+0x158->+0x60).
- Human-specific: person vslot 0x6f0 is non-null for the human; the 0x226f140 validity predicate and relation entries of tag 0x17 (human-add cluster 0x2527b74 / 0x226fc58) are not understood. These may need to run for the game to treat the move as a real human move.
- National job alongside a club job: no check found forbidding it in 0x238cac8; unverified.

## 5. Readback and undo

Readback: the manager's contract team (contract record +0x10, staff contract pointer at staff+0x170, nation contract via vslot 0x3d0), the club's manager slot team+0x80, the national team's manager slot team+0x80.
Undo: call the same move back to the original club (or the leave-job path for a national job). Not restorable: the displaced manager (dismissed, contract ended, wage and history gone), news items and job-event records, audit and analytics entries, and any board or fans reaction state.

## 6. Check in the running game (read-only first)

1. Dump team+0x28 and team+0x2f for a club and a nation; confirm the dismissal branch at 0x2dffc98.
2. Read the human's vslots 0x3a0 and 0x3d0 with a club plus national job to confirm they are separate.
3. Confirm 0x2dfedac accepts the human identity block (object+0x548) and what 0x226f140 returns.
4. Trace 0x33f5dc and 0x33ccec at runtime to see the real map keys.
5. Try the club move on a throwaway save only.

## 7. Blockers

- IGE object dependency of 0x238cac8 (national path).
- Unknown human-special handling (0x226f140, tag 0x17 relations).
- Displaced manager and news cannot be restored.
