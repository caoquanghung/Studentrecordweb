# Student Web — Requirements and Study Protocol Specification

Version: 1.1 — Draft for owner review  
Date: 2026-11-09  
Status: Specification and questionnaire draft; application implementation has not started.

Implementation companion: [Student Web technical design](student-web-technical-design.md), covering Record Web reuse, stack, database locking, playback, ZIP/OPFS preparation, telemetry synchronization, purge, configuration and verification.

## 1. Purpose and authority

Student Web supports a remote HCI user study in which invited participants watch an assigned playlist of recorded lectures and complete questionnaires. Record Web already supports teacher recording. Lecture processing, playlist generation, and the final assignment algorithm remain separate work and must have explicit integration placeholders.

Sources:

- [Project specification](../../project_specification.md).
- [Initial requirements](requirement.md).
- [Earlier use-case specification](use-case-specification.md).
- [Earlier use-case diagram](use-case-diagram.md) and [diagram source](use-case-diagram.mmd).
- The owner's two interview responses on 2026-11-09.

The interview decisions below take precedence over conflicting assumptions in the earlier use-case draft. Those source documents are preserved. This document is the proposed implementation baseline after owner review.

Labels used throughout:

- **Confirmed:** explicitly requested or accepted by the owner.
- **Proposed:** a concrete implementation or protocol choice for review, rather than a previously approved requirement.
- **Placeholder:** an integration, value, or study-specific text the owner will supply later.

## 2. Confirmed decisions

| ID | Decision |
| --- | --- |
| C-01 | Only email addresses invited by an administrator may participate. Authentication uses Clerk and the invited email. |
| C-02 | Participants perform the study remotely on their own laptops. Mobile participation is outside the initial target. |
| C-03 | A combination is an ordered playlist of lecture recording sessions. Different combinations contain different lecture recordings. |
| C-04 | Each participant has one assigned combination at a time and completes one combination for the study. Reassignment is allowed after losing a reservation. |
| C-05 | Gender, age, background knowledge, and other balancing rules belong to the future assignment algorithm. The reservation service enforces combination quotas. |
| C-06 | A reservation lasts 30 minutes before starting the study. If it expires without a start, release the slot. The duration must be easy to change. |
| C-07 | Participants may leave and return before starting. Preserve pre-study answers after reservation expiry and rerun assignment instead of repeating pre-study. |
| C-08 | The strict participation period starts when the participant presses Start Study and continues through successful post-study submission. |
| C-09 | Leaving the study, switching tabs, minimizing the window, or reloading during that period invalidates the attempt. Warn participants before starting. |
| C-10 | Technical interruption also requires starting the combination again. Do not resume partial viewing. |
| C-11 | Delete viewing/study telemetry belonging to an invalid attempt. Preserve pre-study and post-study answers; do not delete the participant account or consent. |
| C-12 | A retry uses the same combination and reservation while its original deadline has not elapsed. |
| C-13 | Lecture playback is sequential, at 1× speed, with no participant pause, seek, skip, or speed controls. |
| C-14 | Post-study is available only after all assigned videos have been watched in a valid attempt. |
| C-15 | Streaming downloads video progressively from cloud storage. ZIP is an alternative that downloads all required resources first and plays them locally through the website. |
| C-16 | ZIP is also available when Internet service is good; it is not restricted to failed speed checks. |
| C-17 | Participation is not restricted to people aged 18 or older. Draft the forms and consent for review. |
| C-18 | Initial admin features: invite email addresses, manage combinations, monitor assigned/in-progress/completed participants, inspect answers and telemetry, and export CSV/JSON. |
| C-19 | Multiple independent studies, rewards/QR, payment recording, thank-you emails, and advanced playlist editing can be delivered later. |

## 3. Scope and terminology

### 3.1 Initial delivery

The initial application includes Clerk authentication, server-side admin/student authorization, invitation access, study information, consent, pre-study, atomic reservation, preparation checks, cloud and ZIP playback, strict attempt handling, telemetry synchronization, post-study, completion, and the admin features in C-18.

There must be a visible and documented development integration for supplying example combinations and exercising the placeholder selector. Example data is not a production assignment algorithm.

### 3.2 Deferred work

- Processing recordings and producing experimental combinations.
- The owner's final assignment/eligibility/balancing algorithm.
- Multiple studies and per-study administrator ownership UI.
- Reward QR collection, payment workflows, and thank-you messages.
- A general-purpose questionnaire builder and complex playlist authoring UI.
- Native applications, kiosk software, mobile support, and entirely offline study execution.
- Webcam, microphone, screen recording, or eye tracking; none is authorized by these requirements.

### 3.3 Terms

| Term | Meaning |
| --- | --- |
| Participant / pID | A stable participant identifier mapped to a verified invited email. Research exports primarily use pID. |
| Combination | An ordered, versioned playlist with a target quota and references to its media resources. |
| Assignment | The participant's current combination selection and its immutable content version. |
| Reservation / slot | One quota unit held for that assignment. Distinct from an actively open browser connection. |
| Reservation deadline | Server timestamp by which an unstarted participant must start; also used to decide slot retention after an invalid attempt. |
| Attempt | One uninterrupted run, from Start Study through post-study submission. A retry creates a new attempt. |
| Active connection lease | Short server-side liveness window during an attempt. Independent of the 30-minute reservation duration. |
| Completion | Server-confirmed valid viewing, saved post-study, and required telemetry synchronization, counted once against quota. |

## 4. Participant flow

1. Admin authorizes an email and sends an invitation.
2. Participant signs in through Clerk using that verified email. An invitation does not itself reserve a combination.
3. The website displays the study description and appropriate consent/assent workflow.
4. Participant agrees and completes pre-study. Save the versioned submission before requesting assignment.
5. Assignment runs and atomically holds one combination slot. Show the playlist duration and reservation countdown.
6. Participant may leave and return before Start Study. The countdown continues; opening the website does not extend it.
7. Participant selects cloud streaming or ZIP preparation. All file pickers, downloads, package validation, sound checks, and readiness checks happen before starting.
8. If streaming readiness fails, offer ZIP or return later. ZIP requires local media readiness and a working server connection, rather than streaming-level download throughput.
9. Participant reads the strict participation rules, confirms readiness, and presses Start Study. The server authorizes one active attempt and the browser enters the required study view.
10. Videos play automatically in order at 1× without participant playback controls. Capture viewing telemetry.
11. After verified complete viewing, display post-study. The strict period remains active while the participant answers.
12. Save answers and required telemetry, then atomically mark completion. End the strict period and release active control.

Before Step 9, leaving is permitted. After Step 9, an interruption invalidates the current attempt under Section 8. A completed participant cannot receive another combination through ordinary re-entry.

## 5. Identity, consent, and invitations

### 5.1 Access and roles

- Authenticate email ownership through Clerk. A verified invited email must match the study authorization; a shared invitation URL alone is insufficient.
- Check access and workflow prerequisites on every relevant server operation, not only in navigation components.
- Students can access only their own assignment, answers, progress, and permitted media.
- Admins can manage invitations and combinations, inspect study data, and export it. Client-controlled role fields must not grant privileges.
- **Proposed:** provision initial admins through trusted server configuration or server-managed role records. No public admin signup.
- **Proposed:** use one stable pID per authenticated participant in the initial deployment, keeping email mapping separate from exported telemetry.
- **Proposed:** invite pending, accepted, failed-to-send, and revoked states. Sending a duplicate invitation does not create another pID or slot. Existing email addresses can be reinvited without duplicate authorization.
- Email delivery provider and the exact Clerk email sign-in method are implementation choices. Report provider acceptance separately from guaranteed delivery.

### 5.2 Consent and age

No blanket 18+ restriction is requested. This does not establish that one self-consent checkbox is sufficient for every participant. The owner must approve the applicable age/assent/guardian procedure for the actual research setting.

**Proposed:** support versioned participant consent/assent records and an optional guardian-permission status when the approved protocol requires it. Do not invent an age threshold or require all younger participants to use the adult form. The initial admin role may record approved permission evidence if the owner chooses that workflow; automated guardian accounts are not included by default.

The form draft in Appendix A is review material. Study contact, institution, retention, sharing, withdrawal handling, and any required permission wording must be filled before collecting real research data. As a research reference, HHS distinguishes child assent and parental permission in its own regulatory context; this specification does not assert that U.S. rules govern this project. [HHS: Research with Children](https://www.hhs.gov/ohrp/regulations-and-policy/guidance/faq/children-research/index.html).

Collect only the minimal age information needed to route the approved permission flow before consent. Collect research questionnaire answers and their telemetry after the required consent/permission is recorded. Record which exact consent version was accepted, its timestamp, and its confirmation method.

## 6. Assignment, reservation, and concurrency

### 6.1 Configurable reservation duration

**Confirmed:** the default reservation duration is 30 minutes.

**Proposed configuration contract:**

```text
reservationDurationSeconds = 1800
reservationExpiresAt = assignedAt + reservationDurationSeconds
```

Read the duration from one validated server configuration source, for example `STUDY_RESERVATION_DURATION_SECONDS`, rather than embedding 30-minute literals throughout UI and API code. Validate a positive integer and store the effective duration/configuration version with each assignment. Send the server timestamp and actual expiry to the client for the countdown.

**Proposed:** configuration changes apply to new reservations. Existing reservations retain their stored deadline unless an explicit audited admin operation changes it. Refreshing, downloading a ZIP, importing a ZIP, revisiting the page, or retrying must not silently reset the original deadline.

### 6.2 Deadline behavior

| Situation | Behavior | Status |
| --- | --- | --- |
| Assigned, not started, deadline has passed | Release slot; preserve pre-study; rerun algorithm on the next assignment request. | Confirmed |
| Preparing ZIP or cloud playback, deadline has passed | Preparation does not count as starting. Refuse Start Study and require assignment again. Revalidate any local package against the new assignment. | Derived from C-06 |
| Invalid attempt, original deadline is still in the future | Retain the slot and combination. Retry the whole combination with a new attempt. | Confirmed |
| Invalid attempt, original deadline has passed | Release the slot; preserve questionnaires; require assignment again. | Proposed interpretation for review |
| Attempt starts before expiry and remains uninterrupted after expiry | Keep the active slot through viewing and post-study. Do not invalidate solely because 30 minutes elapsed. | Proposed interpretation for review |
| Attempt completes successfully | Convert reserved/active slot to completed exactly once. | Confirmed outcome; atomic implementation proposed |

The 30 minutes are a deadline to start, not a proposed limit on lecture duration. The last two interpretations require particular owner attention because the interview did not explicitly settle them.

### 6.3 Quota invariants

For each combination:

```text
held = unexpired waiting/retry reservations + valid active attempts
available = max(targetQuota - completedCount - held, 0)
missingToComplete = max(targetQuota - completedCount, 0)
completedCount + held <= targetQuota
```

An active attempt and its underlying reservation consume one slot, not two. Exclude expired waiting/retry reservations from the held count using server time, even if a background cleanup task has not yet updated their display status. A valid active attempt continues to consume its slot after the original start deadline under the proposed rule in Section 6.2.

- **Proposed:** perform allocation with database transactions and row locking or a conditional atomic update. An in-memory lock inside a web process is insufficient across independent instances.
- Recheck quota at commit time. Two students competing for the last slot cannot both acquire it.
- Only one current assignment and one active attempt are allowed per participant in the initial study.
- Duplicate requests must return the existing result instead of consuming extra quota.
- Reserve, start, invalidate, expire, and complete operations use current state/version checks. Stale tabs cannot overwrite newer state.
- If the selector's candidate fills before reservation commits, re-evaluate current candidates with bounded retry. Return a clear no-slot result if none remains.
- Never hold an open database transaction while waiting for participant input or external algorithm execution.
- **Proposed:** block quota reductions below completed plus held slots; deactivate combinations for new assignment without silently changing current content.

### 6.4 Placeholder assignment API

Provide a replaceable server-side selector interface separate from quota enforcement:

```text
selectCombination({
  participantId,
  preStudyResponse,
  eligibleCombinationSnapshots,
  currentQuotaStatistics,
  algorithmVersion
}) -> candidateCombinationId | noEligibleCombination
```

The final algorithm may use demographic/background data. The reservation layer does not independently create overlapping demographic quotas or assume a particular balancing strategy.

Save the algorithm version and selection result as assignment metadata. Do not embed email or complete questionnaire answers in telemetry payloads.

**Proposed development behavior:** an explicitly enabled deterministic stub selects the first eligible available fixture combination. Label it as a development stub. Production assignment must report algorithm-not-configured until an approved selector/configuration is supplied; never silently use fixture logic in a real study.

After expiry, a fresh algorithm decision may return the same or a different combination. Previous exposure can be passed to the future algorithm as limited assignment metadata if approved; do not retain deleted viewing telemetry for that purpose.

## 7. Media preparation and playback

### 7.1 Combination metadata

Each combination has an ID, title, enabled state, target quota, immutable content version, ordered video references, declared durations, and cloud media references. Include resource identity, byte size where known, MIME/codec metadata, and checksums/package version for ZIP validation.

Pin an assignment to its content version. Changing a playlist for future assignments must not change videos in an existing attempt. The initial admin UI may enable/disable combinations and edit quota, with metadata supplied by a validated seed/import/API; full video upload/reordering authoring is deferred.

### 7.2 Cloud streaming

- Load media progressively without requiring the full playlist download before starting.
- **Proposed:** use a browser-compatible media delivery path with appropriate range access. Adaptive streaming/transcoding is not mandated for the first delivery; evaluate against the actual processed assets.
- Test throughput against representative media delivery, avoiding cached responses as a substitute for current network measurement.
- **Proposed:** configure the streaming readiness threshold from the selected assets' bitrate plus an approved margin, or a study-level override. The Mbps threshold, test duration, sample size, result lifetime, and startup buffer threshold remain configurable values to calibrate with real assets.
- A failed check blocks cloud Start Study, but does not prevent ZIP preparation or assignment itself.
- Validate codec support, first-media readiness, remaining playlist availability, and server connectivity before starting. A short speed test cannot guarantee uninterrupted future playback.

### 7.3 ZIP/local media

- Offer Download ZIP and Import ZIP for the assigned content before the strict period. Downloading a ZIP may take place outside the study page while the reservation countdown continues.
- All study playback still occurs inside Student Web. Playing files in a desktop player does not count.
- **Proposed:** extract and validate locally, without uploading the entire package back to the server. Keep memory/storage usage bounded and report unsupported files or insufficient storage before Start Study.
- **Proposed package contract:** a versioned manifest identifies combination ID/version and ordered resources, each with a relative path, content hash, and expected byte size. Generation remains an integration with the future processing pipeline; provide a documented fixture package for development.
- Validate expected identity, completeness, integrity, supported codec, archive limits, and safe file paths. Reject wrong-combination, stale, damaged, or incomplete packages.
- Materialize and validate all required playback resources before starting; do not allow a file picker mid-attempt.
- ZIP playback requires an online authenticated website connection for authorization, liveness, telemetry, and completion. It does not require sufficient bandwidth to stream the lecture video. Fully offline participation is deferred.
- Both source modes follow identical viewing, focus, invalidation, and completion rules. Record the source mode for analysis.

### 7.4 Player conditions

- Use the assigned order; auto-advance between videos without intentional participant breaks.
- Playback rate is always 1×. No pause, seek, skip, replay, playlist selection, picture-in-picture, or download controls during a valid attempt.
- **Proposed:** provide an audio-output test and volume setup before starting; keep system volume adjustment available without treating an ordinary volume-key press as a violation by itself.
- Unexpected pause, unauthorized seeking, rate changes, or unsupported media behavior must not produce successful viewing credit. Stop and invalidate if the player cannot restore the prescribed valid playback conditions without participant interruption.
- A transient system buffering stall is a recorded technical event, not an allowed participant pause. **Proposed:** tolerate a configurable short stall; prolonged/unrecoverable buffering invalidates the attempt and requires replay from the beginning. The stall threshold needs calibration.
- Do not credit buffering time or hidden-page time as viewed content. Track each video's contiguous valid playback and ended state; a client-ended event alone is insufficient evidence of complete viewing.

## 8. Strict participation and invalid attempts

### 8.1 Feasible browser enforcement

The product enforces attempt validity, rather than promising physical prevention of OS/browser actions. Browsers let users leave fullscreen, and unload warnings are not guaranteed. Use fullscreen and lifecycle signals together with server liveness, not an unload callback as the sole authority. [MDN: Fullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API/Guide), [MDN: beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event).

**Proposed:** require fullscreen for the study application, covering both playback and post-study. Exiting fullscreen, switching tabs, hiding the page, reloading, navigating away, or using Stop Study invalidates the attempt. Browser/OS dialogs may also interfere; complete required prompts before the strict period.

Page visibility indicates whether the page is visible, not whether a participant is cognitively attentive. Do not label measured visible time as proven attention. [MDN: Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

**Proposed:** loss of window focus to another application also invalidates the attempt. Event handling must distinguish duplicate signals for one incident and intentional completion teardown. Detectable focus signals are proxies; a remote website cannot establish that a participant is not using another physical device.

### 8.2 Liveness and failures

- **Proposed:** send authenticated heartbeats during active attempts. Configure heartbeat interval and connection timeout independently of the reservation duration.
- Observed disconnection or confirmed technical interruption invalidates; timeout is the fallback when the server has no direct signal. A missing heartbeat alone cannot establish intent.
- Brief unconfirmed transport delay may wait for the configured timeout, but known interruption cannot resume the same partial attempt.
- Freeze player progress and the post-study submission gate when the client no longer knows that its active authorization is valid.
- Browser crash, power loss, server failure, or prolonged synchronization failure requires a fresh attempt under the same deadline rules. Do not pretend to identify whether the cause was intentional.
- **Proposed:** target current desktop Chrome and Edge first and publish the supported-browser list after playback/fullscreen qualification. Browser choice remains a review decision.

### 8.3 Invalidation and deletion contract

On an invalid attempt:

1. Revoke the attempt's active write/control token and invalidate its video completion proof. It can never complete later using queued requests.
2. Stop playback and close access to post-study until a new valid viewing run finishes.
3. Delete the attempt's viewing/study telemetry from primary storage and pending local queues, including playback events, positions, viewing durations, focus events, buffering details, and viewing-derived summaries.
4. Preserve the participant, invitation, consent, pre-study answers, and any saved post-study answers and their form versions. Do not issue cascading deletion against those records.
5. Retain the same reservation/combination only while the original deadline permits it; otherwise release the quota slot under Section 6.2.
6. Show a clear invalid-attempt message and next action. A retry starts all playlist videos from the beginning with a fresh attempt ID, empty viewing telemetry, and no partial credit.

**Proposed deletion mechanics:** reject all late telemetry for a revoked attempt; make deletion idempotent; remove materialized analytics/export caches controlled by the application. If purge needs background work, mark the attempt as purge-pending and exclude its data from reads/exports immediately. Purge must not accidentally delete a new attempt's data.

**Proposed minimal operational record:** retain only attempt ID, assignment ID, lifecycle status, invalidation timestamp, and a coarse invalidation reason to enforce stale-request rejection, deletion, and admin counts. This is not retained viewing telemetry. Whether to retain the reason at all needs owner review. Deleted detailed violation logs will consequently not be available for admin inspection or export.

Previously downloaded admin exports cannot be recalled by deleting database rows. Backup retention/deletion behavior must be disclosed in the final data policy; do not promise instant deletion from historical backups.

### 8.4 Post-study preservation after invalidation

The owner's instruction explicitly preserves post-study answers. Therefore, an interruption while answering post-study deletes the invalid attempt's viewing telemetry but does not erase a saved survey draft.

**Proposed:** after a full valid replay, re-open a compatible preserved draft, require the participant to review and submit it, and link the new submission to the new valid attempt. Do not use an old draft as automatic completion. If reassignment changes the combination, preserve but do not reuse combination-specific answers for the new playlist.

## 9. Forms and telemetry

### 9.1 Form behavior

- Use the draft questions in Appendices A–C as a review baseline, not validated research instruments.
- Configure study-specific text, lecture topics, answer choices, and form versions through structured files/server configuration initially. A drag-and-drop form builder is deferred.
- Save pre-study so reservation loss does not require repetition. **Proposed:** lock the submitted assignment inputs while an assignment is held; changes require an explicit reviewed workflow.
- **Proposed:** autosave post-study drafts during the strict period. Report unsaved/server-unconfirmed status without claiming the data is durable.
- Show field-level validation and avoid duplicate submissions. Do not mark complete until the server has saved the current post-study submission.
- Maintain separate form timing from viewing telemetry so the invalid-attempt purge cannot erase preserved form records accidentally.

### 9.2 Proposed event and metric catalog

| Scope | Proposed data | Invalid-attempt handling |
| --- | --- | --- |
| Consent/pre-study | Form opened/submitted timestamps, elapsed time, visible active time, page/section durations, validation error codes; no keystroke capture. | Preserve with the pre-study/consent records. |
| Valid viewing attempt | Started/ended, video start/end, periodic playback checkpoints, source mode, playback position, visible/focused intervals, rate/pause/seek violations, buffering and media errors. | Delete if that attempt becomes invalid. |
| Post-study | Opened/saved/submitted timestamps, elapsed and active time, saved answers, validation errors. | Preserve saved form data; do not treat it as proof of valid viewing. |
| Synchronization | Event IDs, sequence numbers, acknowledgment status, retry counters and failures linked to the attempt. | Purge attempt-specific detailed telemetry on invalidation. |
| Reservation operations | Assignment, deadline, state transitions, selector version, quota changes. | Preserve minimum records needed for current ownership and state consistency. |

Useful derived metrics for valid completed attempts include valid viewing duration, visible/focused viewing duration, buffering duration, form completion times, and cloud-versus-ZIP source. Report focus/visibility metrics as behavioral proxies, not measured learning or guaranteed attention.

**Proposed collection mechanics:** event-driven records plus configurable playback checkpoints, durable local queue where available, batch transmission, unique event IDs, per-attempt sequence numbers, client timestamps/monotonic durations, and server receipt timestamps. Calibrate frequency rather than logging on every animation frame.

Only acknowledge accepted events after durable server storage. Retry unacknowledged events without duplicate effects. Client persistence is a temporary delivery mechanism, not permission to restore telemetry after invalidation or an assurance against device/storage loss.

Collect a minimal device/browser capability summary and network readiness results. Exact device fields, telemetry frequency, retention, and backup settings are review items. Do not capture passwords, Clerk tokens, unrelated browsing, full keystrokes, webcam, microphone, or screen content.

## 10. Completion rules

Completion requires all of the following:

1. Verified invited participant and appropriate versioned consent/permission.
2. Current assignment and an authorized uninterrupted attempt.
3. All assigned videos completed sequentially at 1× with valid contiguous playback coverage and no invalidating incident.
4. Current post-study submission saved for the relevant combination and attempt.
5. Required viewing telemetry accepted and stored; no unresolved invalidation or purge for the completing attempt.

Commit the attempt completion, assignment completion, quota transition, and terminal participant status atomically. Duplicate requests return the already established result and never increment quota twice. An invalidation/completion race has one serialized outcome; completion must recheck validity, and client lifecycle handling must stop emitting violations after acknowledged completion.

**Proposed:** make completion requests include an acknowledged telemetry sequence/watermark. The server verifies that required events through that point have arrived before reporting success. Completion time is the server commit timestamp; exclude any resulting response delay from participant form-answering time.

## 11. Admin requirements

### 11.1 Invitations

- Invite by email and view invitation/delivery status.
- View whether the participant has signed in and completed pre-study.
- **Proposed:** support resend and revoke. Revocation must not masquerade as an automatic deletion request for existing research data.

### 11.2 Combination management

- List combinations, ordered content references, target quotas, enabled state, and content versions.
- Edit quota and availability for new assignments, subject to existing-slot protection.
- Show assigned/waiting, actively watching, in post-study, completed, expired, and retry-required states.
- Show held slots, missing completions, and immediately available capacity with a last-updated timestamp.
- **Proposed:** initial metadata entry is through a validated seed/import/API. Uploading/editing/reordering lecture assets in a full authoring UI is deferred.

### 11.3 Participant data and export

- Filter participants by combination and lifecycle state; see reservation deadlines and current source mode where known.
- Inspect consent status, pre-study/post-study answers, and retained valid-attempt telemetry.
- Deleted invalid-attempt viewing events must not appear as retained data. Explain their absence rather than displaying a misleading zero-duration completed session.
- Export CSV and JSON. CSV can be separate files/tables for participants, assignments, questionnaire responses, and telemetry; JSON preserves nested structure.
- **Proposed:** exports include stable IDs, content/form/algorithm versions, timestamps with timezone conventions, units, field definitions, and export filters. Default research exports use pID; email mapping is a separate explicit admin export.
- Restrict every detail query, download, and export to authorized admins. Neutralize spreadsheet-formula interpretation in exported user-controlled CSV cells.
- **Proposed:** log administrative metadata changes and exports without copying full research answers into operational logs.

## 12. Proposed conceptual data model

This is a responsibility map, not an approved database schema.

| Record | Main fields/responsibility |
| --- | --- |
| Participant | pID, Clerk user reference, verified email mapping, role/access status. |
| Invitation | Email authorization, invitation status, sender, delivery reference and timestamps. |
| Study configuration | Consent/form versions, reservation configuration, source/readiness settings and strict participation policy. One active study initially. |
| Consent/permission | Participant, approved route, version, explicit confirmation, timestamp, permitted evidence reference. |
| Form response | Participant, form/version, optional combination/attempt association, answers, draft/submitted state and form timing. |
| Combination/version | Ordered immutable resource references, title, enabled state, target quota and package identity. |
| Assignment/reservation | Participant, combination/version, selector version, assignedAt, original expiry, configuration snapshot, ownership state. |
| Attempt | Assignment, unique attempt/control version, lifecycle state, liveness, server-verified progress and completion proof. Invalid progress is reset and purged. |
| Telemetry event | Event ID, attempt ID, sequence, type, client/server times, typed payload. Attempt-scoped purge boundary. |
| Operational tombstone | Minimal revoked attempt identity/status needed to reject stale writes and enforce purge; coarse reason only if approved. |
| Admin operation | Actor, action, target record, timestamp, safe metadata. |

Use foreign keys and uniqueness constraints that support one active assignment/attempt and idempotent events/submissions. Keep questionnaire ownership independent from cascading attempt-telemetry deletion.

## 13. Proposed server operation boundaries

Exact route names are illustrative; these boundaries make placeholder behavior and race handling reviewable.

| Operation | Responsibility |
| --- | --- |
| Accept invitation / participant bootstrap | Match verified email, authorize participant, find/create stable pID idempotently. |
| Save consent and pre-study | Enforce consent prerequisites and versioning; save reusable pre-study. |
| Request assignment | Return held assignment or expire/release old one, invoke selector, reserve atomically. |
| Get assignment/package manifest | Return authorized content version, countdown, source requirements and package links. |
| Report readiness | Record preflight result for the selected mode; validate its current applicability. |
| Start attempt | Check original deadline, required forms, readiness, server connection and single active control; issue attempt-scoped authorization. |
| Heartbeat / telemetry batch | Validate attempt/version, synchronize events idempotently, acknowledge committed data. |
| Invalidate attempt | Revoke control, purge viewing telemetry, reset progress, retain/release reservation according to deadline. |
| Save post-study / complete | Verify current valid viewing and form ownership; complete transactionally once required data is durable. |
| Expiry/liveness cleanup | Reclaim unstarted expired slots and invalidate abandoned active attempts without relying on browser exit callbacks. |
| Admin operations | Invite, inspect/manage combinations, inspect authorized data, and export. |

**Proposed stack:** reuse the established Record Web approach where suitable: Next.js/React/TypeScript, Clerk, PostgreSQL, and the current cloud media storage. The [technical design](student-web-technical-design.md) proposes a separate Student Web deployment/database and documents the exact reusable patterns and additional modules. Shared infrastructure remains a review choice. Do not couple Student Web directly to unstable processing internals; use versioned metadata contracts.

## 14. Proposed lifecycle states

Reservation/assignment and attempt are separate state machines.

| Assignment state | Meaning / quota |
| --- | --- |
| Unassigned | Pre-study may exist; no held slot. |
| Reserved | One held slot; preparation/leaving permitted until deadline. |
| Active | One held slot backing a valid attempt, including post-study. |
| Retry required | Old attempt invalid; same slot retained only until original deadline. |
| Expired/released | No slot; fresh algorithm decision needed. |
| Completed | Counts once as completed; no new ordinary assignment. |

| Attempt state | Allowed next states |
| --- | --- |
| Watching | Post-study, invalid. |
| Post-study | Completing, invalid. |
| Completing | Completed, invalid, or pending synchronization while still authorized. |
| Invalid | Terminal; telemetry purged/purge pending, no resume. |
| Completed | Terminal; strict period ended. |

Initial Start Study produces Watching. A retry creates a new attempt; Invalid never transitions back to Watching. Read all current status from the server when re-entering the site.

## 15. Acceptance scenarios

| ID | Scenario and expected result |
| --- | --- |
| A-01 | Uninvited verified Clerk user or a different email opening a forwarded invite cannot enter the study. |
| A-02 | Reopening the site before Start Study preserves pID, pre-study, assignment, and the original countdown. |
| A-03 | Two users compete for one remaining slot: exactly one acquires it; no quota oversubscription. |
| A-04 | Duplicate assignment/start requests do not create additional slots or active attempts. A second tab cannot advance another valid run concurrently. |
| A-05 | With a 30-minute reservation, starting at the exact expiry is refused using server time; a fresh request reruns assignment without repeating pre-study. |
| A-06 | Changing reservation configuration affects new reservations and displayed countdowns without editing multiple code paths. Existing deadlines follow Section 6.1. |
| A-07 | ZIP download/import finishes after expiry: old assignment cannot start. A package for a different reassigned combination is rejected. |
| A-08 | Streaming readiness fails: cloud start is blocked; a validated ZIP with adequate server connectivity may still start. Good Internet also allows ZIP. |
| A-09 | Wrong, damaged, oversized, incomplete, or unsupported ZIP is rejected before strict participation begins. |
| A-10 | User switches tab/minimizes/reloads/exits fullscreen during a strict attempt: invalidate, delete its viewing telemetry/progress, preserve forms, and require all videos again. |
| A-11 | Browser crashes without an exit callback: liveness timeout invalidates the attempt; partial progress cannot resume. |
| A-12 | Retry before original expiry retains combination and quota slot; retry does not extend expiry. After expiry, apply release/reassignment policy. |
| A-13 | A run starts before expiry and lasts longer than 30 minutes without interruption: it can finish under the proposed start-deadline interpretation. |
| A-14 | Stale queued events arrive after invalidation/purge or during a new attempt: reject them without restoring deleted telemetry or corrupting the new run. |
| A-15 | Player pause/seek/rate manipulation, missing videos, or forged ended events cannot unlock valid post-study/completion. |
| A-16 | Post-study interrupted after a saved draft: retain the draft, delete invalid viewing telemetry, and require full replay before survey access and submission. |
| A-17 | Submit completed/post-study requests twice or race completion with invalidation: at most one terminal outcome and one quota increment. |
| A-18 | Server has not confirmed required data: UI does not claim completion. On confirmed failure, do not resume partial viewing. |
| A-19 | Admin export includes answers and retained valid telemetry, excludes purged viewing data, and is inaccessible to students. |
| A-20 | Completing the study exits strict monitoring without causing a false fullscreen/focus invalidation. |

## 16. Items for owner review

These items do not require another interview before reviewing this draft. Proposed defaults above make the intended behavior concrete, while leaving unresolved values explicit.

| ID | Review item | Current draft position |
| --- | --- | --- |
| R-01 | Deadline during a long active run and after a late failure | A valid run may finish after the original deadline. A failed run after that deadline loses the slot and requires assignment again. |
| R-02 | Evidence retained after deletion | Retain minimal lifecycle/tombstone metadata; delete detailed viewing and violation telemetry. Coarse failure-reason retention needs approval. |
| R-03 | Focus and technical thresholds | Fullscreen/visibility violations are immediate. Other-app focus loss also invalidates. Liveness, buffering, and synchronization thresholds need real-media calibration. |
| R-04 | Post-study reuse | Preserve drafts; require full replay and participant review. Never reuse combination-specific answers for a different playlist automatically. |
| R-05 | Permission for younger participants | No blanket 18+ gate. Owner approves actual age routing, assent/guardian procedure, and wording for the institution/research setting. |
| R-06 | Consent details | Confirm identity/contact, duration, data access/sharing, retention/backup policy, withdrawal handling and signature method. |
| R-07 | Form content | Approve or edit Appendices A–C, language, required/optional fields and topic-specific knowledge items. |
| R-08 | Technical deployment | Reuse existing stack where suitable; decide shared/separate infrastructure and qualify supported browsers/media. |
| R-09 | Initial combination input | Validated metadata seed/import/API plus quota/availability admin UI; full playlist authoring deferred. |
| R-10 | Volume and timing | Supply anticipated participants, peak simultaneous runs, playlist sizes/durations, storage/retention targets and study dates before capacity validation. |
| R-11 | Final selection and processing | Production selector and processed media/package generation remain explicit placeholders. |

## 17. Technical implementation companion

Use [student-web-technical-design.md](student-web-technical-design.md) for the proposed implementation techniques and delivery sequence. Its configuration defaults, infrastructure choices and code organization are engineering proposals; they do not silently approve or replace the protocol decisions in this document. The companion links to inspected Record Web source files rather than treating a legacy architecture snapshot as authoritative.

## Appendix A. Draft study information and consent/assent

Status: proposed English copy for owner review. Replace all bracketed fields before use. Confirm participant-facing language; Vietnamese localization can follow approval of meaning and protocol.

### A.1 Study information shown before consent

**Title:** Taking part in the recorded lecture study

**Who is running this study?**  
[Researcher name], [institution/team]. Contact: [study email].

**Why are we doing this?**  
We want to understand people's experience of learning from recorded lectures. You will be assigned one playlist of lectures. Different participants may receive different playlists.

**What will I do?**  
You will answer a short questionnaire, prepare the lecture videos, watch your assigned playlist, and answer a final questionnaire. The website will show your playlist duration before you start. Estimated questionnaire time: [owner-approved estimate].

**What are the viewing rules?**  
Once you press Start Study, stay on the study page until you submit the final questionnaire. Videos play in order at normal speed. You cannot pause, skip, seek, or change playback speed. Switching tabs, leaving the study view, reloading, or a technical interruption makes that attempt invalid. You will need to watch the playlist again from the beginning. This also applies to accidental interruptions.

You may leave the preparation page before pressing Start Study. Your assigned slot expires after the countdown shown on that page. If it expires, we will keep your pre-study answers and select a playlist again when you return.

**What information is collected?**  
We collect your questionnaire answers and timing, playlist assignment, video playback timing, whether the study page is visible/focused, network/playback errors, and limited browser capability information. Your invited email is linked to a participant code for access and administration. We do not record your camera, microphone, screen, or unrelated browsing.

**What happens if an attempt is invalid?**  
We delete that attempt's viewing telemetry and viewing progress. Your pre-study answers, consent record, and any saved final-questionnaire answers remain. [If approved: We keep a minimal record that an attempt was invalid, its time, and a general reason.] Detailed deleted viewing events are not included in research exports. Backup deletion follows [approved retention/deletion policy].

**Do I have to take part?**  
Taking part is your choice. You may choose not to start or stop participating. Stopping during the study makes the current attempt invalid; it does not force you to continue. For questions or a request concerning your stored answers, contact [study email]. [Insert approved withdrawal and post-submission deletion procedure.] [State any effect on course grades/rewards only if confirmed.]

**Could this be uncomfortable?**  
You may feel tired or find uninterrupted viewing inconvenient. Check the expected duration and start only when you are comfortable proceeding. You may stop if you need to; the attempt will then need to be restarted if you wish to complete it.

**Who can see my information, and for how long?**  
[Authorized research team and administrator roles]. Data is stored for [retention period] using [approved storage location/access policy]. Research exports use a participant code; the team can link that code to your email, so this is not a promise of complete anonymity. External sharing/publication: [approved statement, including whether only aggregate findings will be shared].

**Questions or concerns:** [study contact]; [independent/institution contact, if applicable].

### A.2 Proposed participant agreement

Show unchecked confirmations with understandable labels:

1. I have read or had explained to me what I will do and what information is collected.
2. I understand the uninterrupted viewing rules and what happens if an attempt is invalid.
3. I understand that taking part is my choice and how to contact the research team.
4. I agree to take part and allow the described study data to be used for this research.

**Proposed confirmation method:** typed name/participant confirmation plus an explicit Agree and Continue button, recorded against the displayed consent version. This is a proposed acknowledgment, not a claim about legal signature sufficiency. Do not require additional legal identity data unless the approved protocol needs it.

Provide Decline and Leave. Declining does not create a reservation or reveal the questionnaire.

### A.3 Proposed younger-participant assent copy

> We are studying how people learn from recorded lessons. You can choose whether to help. If you join, you will answer some questions, watch your assigned lessons without switching away, and answer more questions. The website records what you answer and when the lessons play. It does not record your camera or microphone. If you leave or something stops working, that viewing attempt will not count, and you would need to start the lessons again. You can stop if you want to. You can ask [research contact or approved supporting adult] questions before deciding.

Confirmations:

- I understand what I will do, or someone has explained it to me.
- I know I can ask questions and choose to stop.
- I want to take part.

If guardian permission is required by the approved study protocol, record it separately; participant assent must not stand in for that permission. Guardian information, collection method, age routing, and evidence retention are placeholders for owner review, rather than an assumed new guardian portal.

## Appendix B. Draft pre-study questionnaire

Status: proposed questionnaire, not a validated knowledge or demographic instrument. Required fields may offer Prefer not to say where indicated. The selector must handle those values explicitly instead of inventing answers.

| ID | Question | Response and validation | Required? |
| --- | --- | --- | --- |
| PRE-01 | What is your age in years? | Integer; include Prefer not to say if the approved permission procedure allows unknown age. No 18+ eligibility rule. The permission flow may already hold this answer; do not ask twice unnecessarily. | Yes, subject to approved age/privacy policy |
| PRE-02 | How do you describe your gender? | Woman/girl; Man/boy; Non-binary; Self-describe (optional text); Prefer not to say. | Yes; disclosure optional |
| PRE-03 | What is your current level of education? | Primary school; Lower secondary; Upper secondary; Vocational/college; Undergraduate; Postgraduate; Other; Prefer not to say. | Yes |
| PRE-04 | What is your main subject, major, or area of study? | Short text, maximum 120 characters; Not applicable; Prefer not to say. | Optional |
| PRE-05 | Before today, how familiar were you with [lecture topic]? | 1 Not at all familiar; 2 Slightly; 3 Moderately; 4 Very; 5 Extremely. Repeat for each relevant topic using stable topic IDs. | Yes |
| PRE-06 | Have you studied [lecture topic] before? | No; Informal/self-study; School/university course; Work/practical experience; Other. Multiple choices if applicable. | Yes |
| PRE-07 | How often do you learn from recorded lectures or educational videos? | Never; Less than monthly; Monthly; Weekly; Several times a week; Daily/almost daily. | Yes |
| PRE-08 | How comfortable are you learning in the language used in these lectures? | 1 Not at all comfortable to 5 Extremely comfortable. Display actual lecture language. | Yes |
| PRE-09 | Is there anything about hearing, seeing the content, language, or the viewing rules that you would like the team to know before you start? | Optional short text, maximum 500 characters. Do not request a diagnosis. Include study contact for support. | Optional |

PRE-05/PRE-06 need the owner's actual lecture topic list. An objective baseline knowledge quiz requires content-specific questions and answer keys from the researcher; do not fabricate a generic scored quiz or label self-rated familiarity as measured knowledge.

Display a note that answers are used for research and may help select a playlist. Do not reveal hidden experimental conditions or decision rules. After submission, show Saved and proceed to assignment; expiry never clears this response.

Record form version, openedAt, submittedAt, wall elapsed time, and visible active time. **Proposed:** use section-level timing only initially, avoiding answer-by-answer keystroke histories.

## Appendix C. Draft post-study questionnaire

Status: proposed custom questionnaire. It is not SUS, NASA-TLX, or another validated scale. Keep item wording and scoring transparent; do not claim a validated combined score.

Show: “Please answer based on the playlist you just watched. There are no right or wrong answers to the experience questions.”

| ID | Question | Response | Required? |
| --- | --- | --- | --- |
| POST-01 | How well do you feel you understood the lecture material? | 1 Not at all well to 7 Extremely well. | Yes |
| POST-02 | How mentally demanding was it to follow the lectures? | 1 Not at all demanding to 7 Extremely demanding. | Yes |
| POST-03 | How much effort did you put into understanding the material? | 1 Very little effort to 7 Very high effort. | Yes |
| POST-04 | How easy was it to stay focused on the lectures? | 1 Extremely difficult to 7 Extremely easy. | Yes |
| POST-05 | How clear was the visual presentation? | 1 Not at all clear to 7 Extremely clear. | Yes |
| POST-06 | How clear was the audio? | 1 Not at all clear to 7 Extremely clear. | Yes |
| POST-07 | How suitable was the pace of the lectures? | Much too slow; Slightly too slow; About right; Slightly too fast; Much too fast. | Yes |
| POST-08 | Overall, how satisfied are you with this learning experience? | 1 Extremely dissatisfied to 7 Extremely satisfied. | Yes |
| POST-09 | Did you experience a technical problem during this attempt? | No; Yes; Not sure. If Yes/Not sure, optional explanation up to 500 characters. | Yes |
| POST-10 | Was anything outside the study distracting you while you watched? | No; Yes; Prefer not to say. Optional explanation up to 500 characters. | Yes; disclosure optional |
| POST-11 | What helped you understand the material? | Optional text, maximum 1,000 characters. | Optional |
| POST-12 | What made the material difficult to follow, or what would you improve? | Optional text, maximum 1,000 characters. | Optional |

Topic-specific learning questions, if desired, are a separate placeholder requiring owner-supplied content and scoring. There is no confirmed per-video questionnaire, attention quiz, or mid-playlist task in this scope.

Record openedAt, draft-save times, submittedAt, elapsed time, and visible active time separately from the viewing telemetry purge boundary. Do not report autosave or network waiting time as answer-writing time. If a draft survives invalidation, keep each form visit's timings instead of combining the replay duration into one apparent questionnaire duration.

After successful final submission, show:

> Your study is complete. Your responses and the required study data have been saved. You may now leave this page. Thank you for taking part.

Do not display reward/payment status in this initial version.
